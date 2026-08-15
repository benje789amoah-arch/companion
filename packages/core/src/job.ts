/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LAUNDRY_HUB,
  LAUNDRY_HUB_ADDRESS,
  coordsForAddress,
  distanceKm,
  etaMinutes,
  isOutsideServiceArea,
} from './geo';
import { fromBookingStatus, toBookingStatus } from './status';
import type {
  Booking,
  BookingRiderView,
  Coords,
  Job,
  JobStatus,
  LaundryBag,
  Order,
  OrderPriority,
  RiderState,
} from './types';

/**
 * Projections between the canonical {@link Job} and the two views the apps
 * already speak. Everything crossing the wire between web, server and rider
 * app goes through one of these functions, so the two products can keep their
 * own vocabulary without the data drifting apart.
 */

export function newJobId(): string {
  return `FFC-${Math.floor(100000 + Math.random() * 900000)}`;
}

// ---------------------------------------------------------------------------
// Hand-off codes
// ---------------------------------------------------------------------------

/**
 * Hand-off codes, one for every point the bags change hands.
 *
 * Three legs, three codes: the customer's door on the way out, the laundry hub
 * in the middle, the customer's door on the way back. The party *receiving*
 * the bags holds the code and the party delivering them has to produce it,
 * which is what makes each one worth checking.
 *
 * The customer's screens show a four-digit code; the courier scans or types it
 * before the bags change hands. It proves two things at once — that the
 * courier is at the right door, and that the person handing the bags over is
 * the one who booked the job.
 *
 * Unlike the bag manifest, this is *not* derived from the job id. A code you
 * can compute from a reference printed on a bag tag would verify nothing, so
 * it is minted randomly when the job is created and kept for the job's life.
 *
 * The delivery code used to be the constant `7809` for every job in the
 * system, which is the same as having no code: the courier's app knew it, the
 * "request OTP" button sent it to the customer, and the error message printed
 * it. Both ends are minted the same way now.
 */
export function newHandoffCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Bumped if the payload shape ever changes, so old QRs fail loudly. */
export const HANDOFF_PAYLOAD_VERSION = 'FFH1';

export type HandoffLeg = 'pickup' | 'dropoff' | 'delivery';

export interface HandoffPayload {
  jobId: string;
  leg: HandoffLeg;
  code: string;
}

/**
 * What the QR encodes: `FFH1|FFC-780145|pickup|4821`.
 *
 * The job id travels with the code deliberately. Without it a courier could
 * scan the QR of whoever happened to be standing nearby and have it accepted
 * against the job they are actually on.
 */
export function buildHandoffPayload(jobId: string, leg: HandoffLeg, code: string): string {
  return [HANDOFF_PAYLOAD_VERSION, jobId, leg, code].join('|');
}

/** Returns `null` for anything that is not one of our hand-off QRs. */
export function parseHandoffPayload(text: string): HandoffPayload | null {
  const parts = text.trim().split('|');
  if (parts.length !== 4) return null;

  const [version, jobId, leg, code] = parts;
  if (version !== HANDOFF_PAYLOAD_VERSION) return null;
  if (leg !== 'pickup' && leg !== 'dropoff' && leg !== 'delivery') return null;
  if (!jobId || !code) return null;

  return { jobId, leg, code };
}

/**
 * Whether what the courier scanned or typed unlocks this job's collection.
 *
 * Accepts either the bare digits (typed by hand when a camera will not
 * cooperate) or a full scanned payload, and in the payload case insists the
 * job id matches — see {@link buildHandoffPayload}.
 */
export function verifyHandoff(
  input: string,
  expected: { jobId: string; leg: HandoffLeg; code?: string }
): boolean {
  if (!expected.code) return false;

  const scanned = parseHandoffPayload(input);
  if (scanned) {
    return (
      scanned.jobId === expected.jobId &&
      scanned.leg === expected.leg &&
      scanned.code === expected.code
    );
  }

  return input.trim() === expected.code;
}

/** `FFC-882049` + elite -> `FF-882049-ELITE` */
export function referenceFor(id: string, priority: OrderPriority): string {
  const digits = id.replace(/\D/g, '') || '000000';
  return `FF-${digits}-${priority.toUpperCase()}`;
}

/**
 * Bookings don't declare bags — the customer just describes the work — but the
 * rider's scan-in flow needs something physical to check off. Bags are
 * synthesised from the order value, deterministically, so the same booking
 * always yields the same bag manifest and QR codes.
 */
export function bagsForJob(id: string, amount: number, serviceType: string): LaundryBag[] {
  const digits = id.replace(/\D/g, '') || '000000';
  const count = Math.min(3, Math.max(1, Math.ceil(amount / 50)));

  return Array.from({ length: count }, (_, i) => {
    const suffix = String.fromCharCode(65 + i);
    return {
      id: `BAG-${digits}-${suffix}`,
      type: i === 0 ? serviceType || 'Premium Textiles' : 'Premium Textiles',
      weight: `${(2 + ((digits.charCodeAt(i % digits.length) % 40) / 10)).toFixed(1)}kg`,
      itemCount: 3 + ((digits.charCodeAt((i + 2) % digits.length) + i) % 8),
      qrCode: `FF-BAG-${digits}-${suffix}`,
      scanned: false,
    };
  });
}

/** Bigger jobs and plan members get moved up the queue. */
export function priorityForBooking(amount: number, planId?: string): OrderPriority {
  if (planId) return 'elite';
  if (amount >= 80) return 'elite';
  if (amount >= 45) return 'priority';
  return 'standard';
}

// ---------------------------------------------------------------------------
// Booking (web) -> Job
// ---------------------------------------------------------------------------

/**
 * Where the courier is actually sent.
 *
 * A pin the customer placed themselves wins. Everything else falls back to
 * `coordsForAddress`, which hashes the typed address into a stable offset from
 * the suburb's anchor — the same point on every screen, but not a point
 * anybody lives at: "Evandy Hostel, Room 12" lands some 400 m from Evandy
 * Hostel, and dropping the comma moves it 300 m again. Fine as a placeholder
 * on a map, useless as a doorstep, which is why the customer's own pin exists.
 *
 * A pin outside the Kumasi service area is not a pin, it is a bad fix or a
 * bad caller, and the derived point is the safer answer.
 */
export function pickupPinFor(
  booking: Pick<Booking, 'address' | 'suburb' | 'pickupCoords'>
): Coords {
  const pinned = booking.pickupCoords;
  if (pinned && !isOutsideServiceArea(pinned)) return { lat: pinned.lat, lng: pinned.lng };
  return coordsForAddress(booking.address, booking.suburb);
}

/**
 * Builds the canonical record from a booking submitted on the website. The
 * dispatch half — coordinates, bags, distance, priority — is derived here
 * rather than asked of the customer, which is what lets a booking show up on
 * the rider's board without anybody re-keying it.
 */
export function bookingToJob(booking: Booking, now = new Date().toISOString()): Job {
  const id = booking.id || newJobId();
  const amount = booking.amount ?? 0;
  const priority = priorityForBooking(amount, booking.planId);
  const pickupCoords = pickupPinFor(booking);
  const distance = distanceKm(LAUNDRY_HUB, pickupCoords);

  return {
    id,
    reference: referenceFor(id, priority),
    status: fromBookingStatus(booking.status ?? 'Scheduled'),
    createdAt: booking.createdAt || now,
    updatedAt: now,
    customer: {
      name: booking.name,
      email: booking.email,
      phone: booking.phone,
    },
    service: {
      type: booking.serviceType,
      planId: booking.planId,
      specialtyAddons: booking.specialtyAddons,
      specialInstructions: booking.specialInstructions,
      riderNote: booking.riderNote,
      notes: booking.notes,
    },
    schedule: {
      pickupDate: booking.pickupDate,
      pickupTime: booking.pickupTime,
      deliveryDate: booking.deliveryDate,
      deadline: booking.pickupTime ? `Pickup ${booking.pickupTime}` : undefined,
    },
    location: {
      address: booking.address,
      suburb: booking.suburb,
      city: booking.city,
      pickupCoords,
      // Back to where it was collected from. A round trip: the customer's
      // door, the hub, the customer's door.
      deliveryAddress: [booking.address, booking.suburb].filter(Boolean).join(', '),
      deliveryCoords: { ...pickupCoords },
    },
    dispatch: {
      priority,
      bags: bagsForJob(id, amount, booking.serviceType),
      distanceKm: Number(distance.toFixed(2)),
      estDurationMins: etaMinutes(LAUNDRY_HUB, pickupCoords),
      pickupOtp: newHandoffCode(),
      dropoffOtp: newHandoffCode(),
      deliveryOtp: newHandoffCode(),
      proof: {},
    },
    payment: {
      amount,
      status: booking.paymentStatus ?? 'Pending',
      method: booking.paymentMethod,
      momoNumber: booking.momoNumber,
      momoNetwork: booking.momoNetwork,
      transactionRef: booking.transactionRef,
      paidAt: booking.paidAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Job -> Booking (web)
// ---------------------------------------------------------------------------

export function jobToBooking(job: Job, rider?: RiderState): Booking {
  return {
    id: job.id,
    name: job.customer.name,
    email: job.customer.email,
    phone: job.customer.phone,
    serviceType: job.service.type,
    planId: job.service.planId,
    pickupDate: job.schedule.pickupDate,
    pickupTime: job.schedule.pickupTime,
    deliveryDate: job.schedule.deliveryDate,
    specialInstructions: job.service.specialInstructions,
    specialtyAddons: job.service.specialtyAddons,
    riderNote: job.service.riderNote,
    notes: job.service.notes,
    address: job.location.address,
    city: job.location.city,
    suburb: job.location.suburb,
    status: toBookingStatus(job.status),
    createdAt: job.createdAt,
    paymentStatus: job.payment.status,
    paymentMethod: job.payment.method,
    amount: job.payment.amount,
    momoNumber: job.payment.momoNumber,
    momoNetwork: job.payment.momoNetwork,
    transactionRef: job.payment.transactionRef,
    paidAt: job.payment.paidAt,
    pickupCoords: job.location.pickupCoords,
    rider: rider ? riderViewFor(job, rider) : undefined,
    proof: { ...job.dispatch.proof },
    pickupOtp: job.dispatch.pickupOtp,
    // The customer holds both codes: one to hand the bags over, one to take
    // them back.
    deliveryOtp: job.dispatch.deliveryOtp,
    // The hub's, not the customer's. It travels on this projection because the
    // admin dashboard reads `Booking` — the customer's own screens simply do
    // not render it.
    dropoffOtp: job.dispatch.dropoffOtp,
  };
}

/** The subset of rider telemetry the customer's live map is allowed to render. */
export function riderViewFor(job: Job, rider: RiderState): BookingRiderView {
  const destination =
    job.status === 'navigating_to_delivery' || job.status === 'arrived_at_delivery'
      ? job.location.pickupCoords
      : job.status === 'navigating_to_laundry'
        ? { lat: LAUNDRY_HUB.lat, lng: LAUNDRY_HUB.lng }
        : job.location.pickupCoords;

  return {
    id: rider.id,
    name: rider.name,
    vehicle: rider.vehicle,
    vehiclePlate: rider.vehiclePlate,
    rating: rider.rating,
    coords: rider.coords,
    jobStatus: job.status,
    etaMinutes: etaMinutes(rider.coords, destination),
  };
}

// ---------------------------------------------------------------------------
// Job -> Order (rider app)
// ---------------------------------------------------------------------------

export function jobToOrder(job: Job): Order {
  return {
    id: job.id,
    orderNumber: job.reference,
    customerName: job.customer.name,
    customerPhone: job.customer.phone,
    pickupAddress: [job.location.address, job.location.suburb].filter(Boolean).join(', '),
    pickupCoords: job.location.pickupCoords,
    deliveryAddress: job.location.deliveryAddress,
    deliveryCoords: job.location.deliveryCoords,
    laundryType: job.service.type,
    bagCount: job.dispatch.bags.length,
    bags: job.dispatch.bags,
    priority: job.dispatch.priority,
    status: job.status,
    riderId: job.dispatch.riderId,
    distance: job.dispatch.distanceKm,
    estDuration: job.dispatch.estDurationMins,
    price: job.payment.amount,
    deadline: job.schedule.deadline ?? `Pickup ${job.schedule.pickupTime}`,
    specialInstructions: [job.service.specialInstructions, job.service.riderNote]
      .filter(Boolean)
      .join(' • ') || undefined,
    pickupPhoto: job.dispatch.proof.pickupPhoto,
    pickupSignature: job.dispatch.proof.pickupSignature,
    deliveryPhoto: job.dispatch.proof.deliveryPhoto,
    deliverySignature: job.dispatch.proof.deliverySignature,
    // The collection code travels to the phone because the courier *scans* it:
    // a QR is verified against something, and that has to work in a stairwell
    // with no signal. The delivery and drop-off codes do not, because somebody
    // else reads them out — the customer at the door, the desk at the hub —
    // and the server is the one that checks them. A code the courier's own app
    // is holding is not a code the courier has been told.
    //
    // The hub is the one place on the round trip with a screen, a desk and
    // mains power, so requiring the network there costs nothing.
    pickupOtp: job.dispatch.pickupOtp,
    assignedAt: job.dispatch.assignedAt,
    pickedUpAt: job.dispatch.pickedUpAt,
    deliveredAt: job.dispatch.deliveredAt,
  };
}

// ---------------------------------------------------------------------------
// Carrying proof across a list refresh
// ---------------------------------------------------------------------------

/**
 * Why these exist.
 *
 * List endpoints answer without the proof-of-service blobs — see the projection
 * in the server's job store. Both apps refresh by *replacing* their copy of the
 * board with what the poll returned, so without this a photograph taken thirty
 * seconds ago would disappear from the screen on the next tick: the courier's
 * workflow would ask for the delivery photo a second time, having already sent
 * the first one.
 *
 * A missing field means "not included in this response", never "cleared" —
 * nothing in the API deletes a proof once it is recorded, so keeping what we
 * already hold cannot mask a real deletion.
 */
export function orderWithKnownProof(incoming: Order, previous?: Order): Order {
  if (!previous) return incoming;
  return {
    ...incoming,
    pickupPhoto: incoming.pickupPhoto ?? previous.pickupPhoto,
    pickupSignature: incoming.pickupSignature ?? previous.pickupSignature,
    deliveryPhoto: incoming.deliveryPhoto ?? previous.deliveryPhoto,
    deliverySignature: incoming.deliverySignature ?? previous.deliverySignature,
  };
}

/** The same carry-forward for the customer's view of a job. */
export function bookingWithKnownProof(incoming: Booking, previous?: Booking): Booking {
  if (!previous?.proof) return incoming;
  return {
    ...incoming,
    proof: {
      // The list still carries the override reasons, so the incoming copy wins
      // on those; only the blobs it left behind are filled in from what we had.
      ...previous.proof,
      ...incoming.proof,
      pickupPhoto: incoming.proof?.pickupPhoto ?? previous.proof.pickupPhoto,
      pickupSignature: incoming.proof?.pickupSignature ?? previous.proof.pickupSignature,
      deliveryPhoto: incoming.proof?.deliveryPhoto ?? previous.proof.deliveryPhoto,
      deliverySignature: incoming.proof?.deliverySignature ?? previous.proof.deliverySignature,
    },
  };
}

/** An `Order` the rider app invented locally, folded back into a `Job`. */
export function orderToJob(order: Order, now = new Date().toISOString()): Job {
  return {
    id: order.id,
    reference: order.orderNumber,
    status: order.status,
    createdAt: now,
    updatedAt: now,
    customer: {
      name: order.customerName,
      email: '',
      phone: order.customerPhone,
    },
    service: {
      type: order.laundryType,
      specialInstructions: order.specialInstructions,
    },
    schedule: {
      pickupDate: now.split('T')[0],
      pickupTime: '',
      deliveryDate: now.split('T')[0],
      deadline: order.deadline,
    },
    location: {
      address: order.pickupAddress,
      suburb: '',
      pickupCoords: order.pickupCoords,
      deliveryAddress: order.deliveryAddress,
      deliveryCoords: order.deliveryCoords,
    },
    dispatch: {
      priority: order.priority,
      bags: order.bags,
      riderId: order.riderId,
      distanceKm: order.distance,
      estDurationMins: order.estDuration,
      pickupOtp: order.pickupOtp ?? newHandoffCode(),
      // The rider's view never carried either of these, so folding an order
      // back into a job mints fresh ones rather than inventing a shared
      // constant.
      dropoffOtp: newHandoffCode(),
      deliveryOtp: newHandoffCode(),
      assignedAt: order.assignedAt,
      pickedUpAt: order.pickedUpAt,
      deliveredAt: order.deliveredAt,
      proof: {
        pickupPhoto: order.pickupPhoto,
        pickupSignature: order.pickupSignature,
        deliveryPhoto: order.deliveryPhoto,
        deliverySignature: order.deliverySignature,
      },
    },
    payment: {
      amount: order.price,
      status: 'Pending',
    },
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface JobStatusPatch {
  status: JobStatus;
  riderId?: string;
  photo?: string;
  signature?: string;
  bags?: LaundryBag[];
}

/**
 * The single place a job's status changes. Timestamps and proof-of-service
 * attachments are stamped here so the rider app, the admin dashboard and the
 * server all record a transition the same way.
 */
export function applyStatus(job: Job, patch: JobStatusPatch, now = new Date().toISOString()): Job {
  const next: Job = {
    ...job,
    status: patch.status,
    updatedAt: now,
    dispatch: { ...job.dispatch, proof: { ...job.dispatch.proof } },
  };

  if (patch.riderId !== undefined) next.dispatch.riderId = patch.riderId;
  if (patch.bags) next.dispatch.bags = patch.bags;

  if (patch.photo) {
    if (isPickupLeg(patch.status)) next.dispatch.proof.pickupPhoto = patch.photo;
    else next.dispatch.proof.deliveryPhoto = patch.photo;
  }

  if (patch.signature) {
    if (isPickupLeg(patch.status)) next.dispatch.proof.pickupSignature = patch.signature;
    else next.dispatch.proof.deliverySignature = patch.signature;
  }

  // Stamped when a courier first takes the job, not when the status reads
  // `assigned`. A job a supervisor had already moved down the board is claimed
  // where it stands and never passes through that status, so keying on it left
  // the courier's own job card with no start time.
  if (patch.riderId && !next.dispatch.assignedAt) next.dispatch.assignedAt = now;
  if (patch.status === 'picked_up') next.dispatch.pickedUpAt = now;
  if (patch.status === 'delivered') next.dispatch.deliveredAt = now;
  if (patch.status === 'unassigned') next.dispatch.riderId = undefined;

  return next;
}

function isPickupLeg(status: JobStatus): boolean {
  return (
    status === 'arrived_at_pickup' ||
    status === 'pickup_scanned' ||
    status === 'picked_up' ||
    status === 'navigating_to_pickup'
  );
}

/**
 * Folds an edit made on the website (admin dashboard or client portal) back
 * into the canonical record. Dispatch-owned fields are deliberately not
 * writable from here — the rider app is the authority on those.
 */
export function applyBookingPatch(
  job: Job,
  patch: Partial<Booking>,
  now = new Date().toISOString()
): Job {
  const next: Job = {
    ...job,
    updatedAt: now,
    customer: { ...job.customer },
    service: { ...job.service },
    schedule: { ...job.schedule },
    location: { ...job.location },
    dispatch: { ...job.dispatch, proof: { ...job.dispatch.proof } },
    payment: { ...job.payment },
  };

  if (patch.name !== undefined) next.customer.name = patch.name;
  if (patch.email !== undefined) next.customer.email = patch.email;
  if (patch.phone !== undefined) next.customer.phone = patch.phone;

  if (patch.serviceType !== undefined) next.service.type = patch.serviceType;
  if (patch.planId !== undefined) next.service.planId = patch.planId;
  if (patch.specialtyAddons !== undefined) next.service.specialtyAddons = patch.specialtyAddons;
  if (patch.specialInstructions !== undefined) {
    next.service.specialInstructions = patch.specialInstructions;
  }
  if (patch.riderNote !== undefined) next.service.riderNote = patch.riderNote;
  if (patch.notes !== undefined) next.service.notes = patch.notes;

  if (patch.pickupDate !== undefined) next.schedule.pickupDate = patch.pickupDate;
  if (patch.pickupTime !== undefined) {
    next.schedule.pickupTime = patch.pickupTime;
    next.schedule.deadline = `Pickup ${patch.pickupTime}`;
  }
  if (patch.deliveryDate !== undefined) next.schedule.deliveryDate = patch.deliveryDate;

  // Re-pin the job if the customer moved it. A patch that carries a pin is the
  // customer having dragged it somewhere better, which outranks a re-derive
  // from the address — so the pin is fed back through the same resolver the
  // booking used rather than being ignored the way it used to be.
  if (
    patch.address !== undefined ||
    patch.suburb !== undefined ||
    patch.pickupCoords !== undefined
  ) {
    next.location.address = patch.address ?? job.location.address;
    next.location.suburb = patch.suburb ?? job.location.suburb;
    next.location.pickupCoords = pickupPinFor({
      address: next.location.address,
      suburb: next.location.suburb,
      // An address edit with no new pin re-derives; the old pin was placed
      // against the old address and may be nowhere near the new one.
      pickupCoords: patch.pickupCoords,
    });
    // The clean laundry goes back to the same door, so moving the pin moves
    // both ends of the round trip.
    next.location.deliveryAddress = [next.location.address, next.location.suburb]
      .filter(Boolean)
      .join(', ');
    next.location.deliveryCoords = { ...next.location.pickupCoords };

    next.dispatch.distanceKm = Number(
      distanceKm(LAUNDRY_HUB, next.location.pickupCoords).toFixed(2)
    );
    next.dispatch.estDurationMins = etaMinutes(LAUNDRY_HUB, next.location.pickupCoords);
  }
  if (patch.city !== undefined) next.location.city = patch.city;

  if (patch.amount !== undefined) next.payment.amount = patch.amount;
  if (patch.paymentStatus !== undefined) next.payment.status = patch.paymentStatus;
  if (patch.paymentMethod !== undefined) next.payment.method = patch.paymentMethod;
  if (patch.momoNumber !== undefined) next.payment.momoNumber = patch.momoNumber;
  if (patch.momoNetwork !== undefined) next.payment.momoNetwork = patch.momoNetwork;
  if (patch.transactionRef !== undefined) next.payment.transactionRef = patch.transactionRef;
  if (patch.paidAt !== undefined) next.payment.paidAt = patch.paidAt;

  // A coarse stage picked in the dashboard only moves the job if it actually
  // means a different dispatch state — otherwise round-tripping a booking
  // through the UI would rewind the rider's progress.
  if (patch.status !== undefined && toBookingStatus(job.status) !== patch.status) {
    next.status = fromBookingStatus(patch.status, job.status);
    if (next.status === 'delivered' && !next.dispatch.deliveredAt) {
      next.dispatch.deliveredAt = now;
    }
  }

  return next;
}
