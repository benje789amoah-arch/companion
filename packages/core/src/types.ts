/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The domain model shared by every FreshFold surface.
 *
 * A single piece of work — one customer's laundry, from booking to doorstep —
 * is a {@link Job}. The customer-facing web app has always called it a
 * `Booking`; the rider app has always called it an `Order`. Those are both real
 * and both useful, so neither is thrown away: they are *projections* of the
 * same `Job` record, produced by `jobToBooking` / `jobToOrder` in `./job`.
 *
 * The server stores `Job`. Everything else is a view.
 */

import type { ActivePlan } from './membership';

export interface Coords {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The canonical lifecycle, at dispatch granularity.
 *
 * This is deliberately the *finer* of the two vocabularies: every customer-
 * facing stage can be derived from it, but not the reverse. `./status` holds
 * the mapping in both directions.
 */
export type JobStatus =
  | 'unassigned'
  | 'assigned'
  | 'navigating_to_pickup'
  | 'arrived_at_pickup'
  | 'pickup_scanned'
  | 'picked_up'
  | 'navigating_to_laundry'
  | 'arrived_at_laundry'
  | 'dropped_off'
  | 'processing'
  | 'ready_for_delivery'
  | 'navigating_to_delivery'
  | 'arrived_at_delivery'
  | 'delivered'
  | 'cancelled';

/** What the customer sees on the progress bar in the client portal. */
export type BookingStatus =
  | 'Scheduled'
  | 'Collecting'
  | 'In Care'
  | 'Ironing & Folding'
  | 'Quality Check'
  | 'Delivering'
  | 'Delivered'
  | 'Cancelled';

export type OrderPriority = 'standard' | 'priority' | 'elite';

export type PaymentStatus = 'Pending' | 'Paid' | 'Pay on Pickup' | 'Refunded';

export type MomoNetwork = 'MTN' | 'Telecel' | 'AT';

// ---------------------------------------------------------------------------
// Job — the canonical record
// ---------------------------------------------------------------------------

export interface LaundryBag {
  id: string;
  type: string;
  weight: string;
  itemCount: number;
  qrCode: string;
  scanned: boolean;
}

export interface JobCustomer {
  name: string;
  email: string;
  phone: string;
}

export interface JobService {
  /** Free-text service name, e.g. "Boutique Wash & Press". */
  type: string;
  /** Subscription plan this job was booked under, if any. */
  planId?: string;
  specialtyAddons?: string[];
  specialInstructions?: string;
  /** Short note the customer left specifically for the rider. */
  riderNote?: string;
  notes?: string;
}

export interface JobSchedule {
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  /** Human deadline shown on the rider's job card, e.g. "Pickup by 19:30". */
  deadline?: string;
}

export interface JobLocation {
  /** Customer's pickup address — free text as typed into the booking form. */
  address: string;
  suburb: string;
  city?: string;
  pickupCoords: Coords;
  /**
   * Where the clean laundry goes back to — the customer's own door.
   *
   * This used to hold the hub, which is where the bags go *first*. That leg
   * has its own destination in the rider console (`LAUNDRY_HUB_COORDS`), so
   * naming the hub here meant the final delivery leg pointed the courier back
   * to the laundry with the customer's clean clothes on the seat.
   */
  deliveryAddress: string;
  deliveryCoords: Coords;
}

export interface JobProof {
  pickupPhoto?: string;
  pickupSignature?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
  /**
   * Set when a delivery completed without the customer's code — nobody in, a
   * neighbour took it, the concierge desk signed for it. The courier has to
   * say which, and the job carries that sentence for the rest of its life:
   * it is the difference between a documented exception and a courier
   * marking their own homework.
   */
  deliveryOverrideReason?: string;
  deliveryOverrideAt?: string;
  /**
   * The same escape hatch one leg earlier: bags left at a hub whose desk was
   * unattended, or whose screen nobody could get to. Recorded for the same
   * reason — the alternative is a courier deciding on their own that the
   * handover happened.
   */
  dropoffOverrideReason?: string;
  dropoffOverrideAt?: string;
}

export interface JobDispatch {
  priority: OrderPriority;
  bags: LaundryBag[];
  /** Pickup distance from the hub, in km. */
  distanceKm: number;
  estDurationMins: number;
  riderId?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  /**
   * The code the customer shows — as digits or a QR — for the courier to check
   * before taking the bags. Minted once when the job is created and never
   * regenerated, so the code the customer is looking at stays the one the
   * courier will accept.
   */
  pickupOtp?: string;
  /**
   * The hub's code, shown on the dispatch desk's screen when the courier
   * arrives with the bags.
   *
   * The middle leg used to have no check at all: the courier tapped through a
   * bag manifest their own phone had generated and the job moved to
   * `dropped_off` on nobody's word but theirs. This is the hub asserting it
   * actually received the load, which is the only party in a position to.
   */
  dropoffOtp?: string;
  deliveryOtp?: string;
  proof: JobProof;
}

export interface JobPayment {
  amount: number;
  status: PaymentStatus;
  method?: string;
  momoNumber?: string;
  momoNetwork?: MomoNetwork;
  transactionRef?: string;
  paidAt?: string;
}

export interface Job {
  /**
   * Shared identity. Formatted `FFC-######` — the same string the customer sees
   * as their booking reference and the rider sees on the job card, so a support
   * conversation can name one id and mean one thing.
   */
  id: string;
  /** Display reference on the rider console, e.g. `FF-882049-ELITE`. */
  reference: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  customer: JobCustomer;
  service: JobService;
  schedule: JobSchedule;
  location: JobLocation;
  dispatch: JobDispatch;
  payment: JobPayment;
}

// ---------------------------------------------------------------------------
// Booking — the customer-facing projection (apps/web)
// ---------------------------------------------------------------------------

export interface Booking {
  id: string;
  name: string;
  email: string;
  phone: string;
  serviceType: string;
  planId?: string;
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  specialInstructions?: string;
  specialtyAddons?: string[];
  riderNote?: string;
  notes?: string;
  address: string;
  city?: string;
  suburb: string;
  status: BookingStatus;
  createdAt: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string;
  amount?: number;
  momoNumber?: string;
  momoNetwork?: MomoNetwork;
  transactionRef?: string;
  paidAt?: string;
  /**
   * The pin the rider is actually navigating to.
   *
   * Sent by the customer when they placed one themselves — the app asks for
   * the doorstep rather than guessing at it, because "Evandy Hostel, Room 12"
   * is not a coordinate and the courier has to end up somewhere real. Omitted,
   * the server derives a pin from the address so a booking made anywhere else
   * still lands on the map.
   *
   * Either way it comes back on every read, so the customer's map and the
   * rider's map show the same point rather than each resolving the address
   * their own way.
   */
  pickupCoords?: Coords;
  /**
   * Live dispatch detail, present once a rider is on the job. Read-only from
   * the web app's point of view — the rider app owns these.
   */
  rider?: BookingRiderView;
  /**
   * Proof-of-service captured during the job. Read-only here for the same
   * reason as `rider`: the handover surfaces write it, the customer's screens
   * only display it. `applyBookingPatch` ignores it, so echoing a booking back
   * in a PATCH cannot overwrite what was actually captured at the door.
   */
  proof?: JobProof;
  /**
   * The collection code, so the customer's screens can render it as digits and
   * a QR. Read-only here as well — the server mints it.
   */
  pickupOtp?: string;
  /**
   * The delivery code, to read out to the courier at the door before taking
   * the clean laundry back. The courier's own app never receives this one:
   * they type what they are told and the server checks it.
   */
  deliveryOtp?: string;
  /**
   * The hub's drop-off code. Rendered on the dispatch desk's pipeline row, not
   * on any customer screen — the customer is not at the hub and this is not
   * their handover. It rides on `Booking` because that is the projection the
   * admin dashboard reads; `Order` deliberately has no equivalent, so the
   * courier's phone cannot answer its own challenge.
   */
  dropoffOtp?: string;
}

/** The slice of rider telemetry the customer is allowed to see. */
export interface BookingRiderView {
  id: string;
  name: string;
  vehicle: string;
  vehiclePlate: string;
  rating: number;
  coords: Coords;
  /** Dispatch-granularity status, for the live map's stage readout. */
  jobStatus: JobStatus;
  etaMinutes?: number;
}

// ---------------------------------------------------------------------------
// Order — the dispatch projection (apps/mobile)
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupCoords: Coords;
  deliveryAddress: string;
  deliveryCoords: Coords;
  laundryType: string;
  bagCount: number;
  bags: LaundryBag[];
  priority: OrderPriority;
  status: JobStatus;
  /**
   * The courier who holds this job, absent while nobody does.
   *
   * The board a phone is sent is *its own jobs plus the open pool*, so without
   * this the app could not tell the two apart — and it did not: the workflow
   * sheet took the first non-`unassigned` job it found, which on a board with
   * more than one job in flight is somebody else's. It is only ever this
   * courier's id or nothing, because the server never sends a job that belongs
   * to a third party.
   */
  riderId?: string;
  /** in km */
  distance: number;
  /** in mins */
  estDuration: number;
  price: number;
  deadline: string;
  specialInstructions?: string;
  pickupPhoto?: string;
  pickupSignature?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
  /**
   * Checked against what the customer shows before the bags change hands.
   * There is no `deliveryOtp` or `dropoffOtp` here on purpose — see
   * `jobToOrder`.
   */
  pickupOtp?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

/**
 * Retained so existing rider-app code that imports `OrderStatus` keeps
 * compiling. `JobStatus` is the name to prefer in new code.
 */
export type OrderStatus = JobStatus;

// ---------------------------------------------------------------------------
// Rider
// ---------------------------------------------------------------------------

export interface RiderState {
  id: string;
  name: string;
  /**
   * Assigned by the server when a supervisor adds the courier, and fixed from
   * then on. It is a sign-in identifier, so neither the supervisor nor the
   * courier gets to type it.
   */
  employeeId: string;
  /**
   * Contact number on the employment record. Doubles as an alternative
   * sign-in identifier — a courier who has forgotten their employee ID has
   * not forgotten their own number.
   */
  phone: string;
  avatar: string;
  /**
   * The vehicle this courier rides and the plate on it. Company property, so
   * both are assigned by a supervisor from the roster console rather than
   * typed in by the courier — the customer is shown them at the door, and a
   * plate nobody checked is worth nothing there.
   */
  vehicle: string;
  vehiclePlate: string;
  rating: number;
  isOnline: boolean;
  batteryLevel: number;
  /** in meters */
  gpsAccuracy: number;
  /** in km/h */
  speed: number;
  /** in degrees */
  heading: number;
  coords: Coords;
  todayDistance: number;
  todayEarnings: number;
  completedCount: number;
  onTimeRate: number;
  acceptanceRate: number;
  completionRate: number;
  /**
   * True while the courier is still on the temporary PIN a supervisor issued.
   * The console blocks everything until it is replaced. Not a credential —
   * just the fact that one is still provisional.
   */
  mustChangePin?: boolean;
}

/**
 * Telemetry the rider app pushes to the server on a timer.
 *
 * Only what the phone can honestly claim about itself: where it is, how fast,
 * whose name is on it. The vehicle and its plate are company property assigned
 * by a supervisor, and the employee ID is a sign-in identifier — none of those
 * are a courier's to declare, so none of them are in here.
 */
export type RiderTelemetry = Partial<
  Pick<
    RiderState,
    | 'name'
    | 'isOnline'
    | 'coords'
    | 'speed'
    | 'heading'
    | 'batteryLevel'
    | 'gpsAccuracy'
  >
>;

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export type MessageSender = 'rider' | 'customer' | 'dispatcher' | 'laundry_center';

export interface Message {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  /** Job id this message belongs to. */
  orderId?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: 'order' | 'system' | 'message' | 'alert';
  orderId?: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Accounts & payments
// ---------------------------------------------------------------------------

/**
 * A customer account as it travels over the wire.
 *
 * Deliberately has no credential field. Passwords are hashed on the server and
 * never leave it — not in a list response, not in a login response. Anything
 * that needs to check a password calls `/api/auth/login`, which does the
 * comparison server-side.
 */
export interface UserAccount {
  email: string;
  phone: string;
  name: string;
  createdAt: string;
  points?: number;
  walletBalance?: number;
  /** Whether a password has been set, so the UI can offer setup vs. sign-in. */
  hasPassword?: boolean;
  /**
   * Whether the address has been confirmed by clicking the emailed link.
   *
   * Customers only. Couriers and supervisors are provisioned rather than
   * self-registered, never pass through `/api/auth`, and have no equivalent
   * field. A booking made from a signed-in but unconfirmed account is refused
   * by the server, so the portal reads this to explain that up front rather
   * than letting the customer fill in a whole form first.
   */
  emailVerified?: boolean;
  /**
   * The membership this account holds, settled as of the moment it was read.
   *
   * Server-owned: it is a paid entitlement, and `/api/accounts` will not write
   * it. Subscribing and cancelling go through `/api/accounts/plan`, which is
   * the only path that can move the wallet and the plan together.
   */
  plan?: ActivePlan | null;
  /**
   * When a supervisor suspended this account, or absent while it is in good
   * standing.
   *
   * Supervisor-owned, like the plan: only `/api/accounts/:email/blocked` writes
   * it. A blocked account cannot sign in, cannot book, and resolves to nobody
   * on every request — so a token issued before the block stops working at once
   * rather than at the end of its week.
   */
  blockedAt?: string;
  /**
   * Why, in the supervisor's words.
   *
   * Present only on the response to the request that set it, which is behind a
   * supervisor session. `sanitize` strips it everywhere else — `GET /accounts`
   * answers anyone, and a private note about a customer is not for publishing.
   */
  blockedReason?: string;
}

/** A signed-in session: the account plus the bearer token that proves it. */
export interface AuthSession {
  token: string;
  account: UserAccount;
}

/**
 * A signed-in courier. The rider equivalent of {@link AuthSession}.
 *
 * `RiderState` carries no credential field for the same reason `UserAccount`
 * does not: the PIN is hashed on the server and never leaves it.
 */
export interface RiderSession {
  token: string;
  rider: RiderState;
}

/** A supervisor as the dashboard sees them. No credentials, by construction. */
export interface SupervisorProfile {
  id: string;
  name: string;
  email: string;
}

/** A signed-in supervisor. */
export interface AdminSession {
  token: string;
  supervisor: SupervisorProfile;
}

export interface PaymentTransaction {
  id: string;
  bookingId?: string;
  userEmail?: string;
  amount: number;
  method: string;
  status: 'Successful' | 'Pending' | 'Failed';
  reference: string;
  timestamp: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Marketing catalogue (web only, but typed here so the server can validate it)
// ---------------------------------------------------------------------------

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  priceInfo: string;
  iconName: string;
  category: 'core' | 'specialized' | 'express';
  imageUrl: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string;
  price: string;
  billing: string;
  popular?: boolean;
  benefits: string[];
  capacity: string;
  turnaround: string;
  iconName: string;
}

export interface LoyaltyTier {
  id: 'basic' | 'silver' | 'gold';
  name: string;
  cardName: string;
  description: string;
  minPoints: number;
  discountRate: number;
  benefits: string[];
  colorFrom: string;
  colorTo: string;
  textColor: string;
}

export interface StatItem {
  id: string;
  title: string;
  value: string;
  description: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  rating: number;
  avatarUrl: string;
}
