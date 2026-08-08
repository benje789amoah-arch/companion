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
  /** Where the rider takes the bags. Normally the hub; see `./geo`. */
  deliveryAddress: string;
  deliveryCoords: Coords;
}

export interface JobProof {
  pickupPhoto?: string;
  pickupSignature?: string;
  deliveryPhoto?: string;
  deliverySignature?: string;
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
   * The pin the rider is actually navigating to. Derived server-side from the
   * address, and surfaced here so the customer's map and the rider's map show
   * the same point rather than each geocoding the address their own way.
   */
  pickupCoords?: Coords;
  /**
   * Live dispatch detail, present once a rider is on the job. Read-only from
   * the web app's point of view — the rider app owns these.
   */
  rider?: BookingRiderView;
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
  deliveryOtp?: string;
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
  employeeId: string;
  avatar: string;
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
}

/** Telemetry the rider app pushes to the server on a timer. */
export type RiderTelemetry = Partial<
  Pick<
    RiderState,
    | 'name'
    | 'employeeId'
    | 'vehicle'
    | 'vehiclePlate'
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
}

/** A signed-in session: the account plus the bearer token that proves it. */
export interface AuthSession {
  token: string;
  account: UserAccount;
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
