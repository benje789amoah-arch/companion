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
} from './geo';
import { fromBookingStatus, toBookingStatus } from './status';
import type {
  Booking,
  BookingRiderView,
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

/** The demo delivery hand-off code, shared so both ends agree. */
export const DEMO_DELIVERY_OTP = '7809';

export function newJobId(): string {
  return `FFC-${Math.floor(100000 + Math.random() * 900000)}`;
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
 * Builds the canonical record from a booking submitted on the website. The
 * dispatch half — coordinates, bags, distance, priority — is derived here
 * rather than asked of the customer, which is what lets a booking show up on
 * the rider's board without anybody re-keying it.
 */
export function bookingToJob(booking: Booking, now = new Date().toISOString()): Job {
  const id = booking.id || newJobId();
  const amount = booking.amount ?? 0;
  const priority = priorityForBooking(amount, booking.planId);
  const pickupCoords = coordsForAddress(booking.address, booking.suburb);
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
      deliveryAddress: LAUNDRY_HUB_ADDRESS,
      deliveryCoords: { lat: LAUNDRY_HUB.lat, lng: LAUNDRY_HUB.lng },
    },
    dispatch: {
      priority,
      bags: bagsForJob(id, amount, booking.serviceType),
      distanceKm: Number(distance.toFixed(2)),
      estDurationMins: etaMinutes(LAUNDRY_HUB, pickupCoords),
      deliveryOtp: DEMO_DELIVERY_OTP,
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
    deliveryOtp: job.dispatch.deliveryOtp,
    assignedAt: job.dispatch.assignedAt,
    pickedUpAt: job.dispatch.pickedUpAt,
    deliveredAt: job.dispatch.deliveredAt,
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
      distanceKm: order.distance,
      estDurationMins: order.estDuration,
      deliveryOtp: order.deliveryOtp ?? DEMO_DELIVERY_OTP,
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

  if (patch.status === 'assigned' && !next.dispatch.assignedAt) next.dispatch.assignedAt = now;
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

  // Re-pin the job if the customer moved it.
  if (patch.address !== undefined || patch.suburb !== undefined) {
    next.location.address = patch.address ?? job.location.address;
    next.location.suburb = patch.suburb ?? job.location.suburb;
    next.location.pickupCoords = coordsForAddress(
      next.location.address,
      next.location.suburb
    );
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
