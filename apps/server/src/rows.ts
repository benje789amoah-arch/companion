/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isMembershipPlanId, membershipPlan, normaliseAddresses } from '@freshfold/core';
import type {
  ActivePlan,
  AuditEvent,
  AuditEventType,
  Coords,
  Job,
  JobCustomer,
  JobDispatch,
  JobLocation,
  JobPayment,
  JobSchedule,
  JobService,
  JobStatus,
  Message,
  MessageSender,
  Notification,
  PaymentTransaction,
  RiderState,
  SavedAddress,
  UserAccount,
} from '@freshfold/core';

/**
 * The boundary between a database row and a domain record.
 *
 * Every mapper here builds its result field by field rather than spreading the
 * row. That is deliberate and load-bearing: `sanitize` and `sanitizeRider` in
 * `./passwords` strip credentials by destructuring the *known* fields off and
 * spreading the rest, so any column that arrived unannounced — `phone_key`,
 * `seq` — would sail straight through them and out to a client. Listing the
 * fields means a record can only carry what the domain model says it carries.
 */

// ---------------------------------------------------------------------------
// Server-side record types
// ---------------------------------------------------------------------------

/**
 * An account as it exists at rest, with its credentials.
 *
 * This type stays inside the server. `sanitize` in `./passwords` converts it to
 * the `UserAccount` clients receive, which has no credential fields at all.
 */
export type StoredAccount = UserAccount & {
  passwordSalt?: string;
  passwordHash?: string;
  /**
   * The outstanding email-confirmation link, as a sha-256 digest.
   *
   * Server-side only, like the password fields above and for the same reason:
   * `sanitize` drops it, and a client that could read it could confirm an
   * address it does not own. Null once the link has been spent.
   */
  verificationTokenHash?: string;
  verificationExpiresAt?: string;
  /** When the last link was sent, which is what rate-limits the resend button. */
  verificationSentAt?: string;
  /**
   * The outstanding password-reset link, as a sha-256 digest.
   *
   * Held apart from the verification token rather than sharing one column: the
   * two links grant different things, and a customer confirming an address
   * should not invalidate the reset they asked for a minute earlier.
   */
  resetTokenHash?: string;
  resetExpiresAt?: string;
  /** When the last reset link was sent, which rate-limits requests. */
  resetSentAt?: string;
};

/**
 * A courier as they exist at rest.
 *
 * Same arrangement as `StoredAccount`: credentials live here and never leave
 * the server. `RiderState` — the type every client sees — has no credential
 * fields at all, and `sanitizeRider` is what converts between them.
 *
 * `active` is how someone leaves the roster. Deleting the record would orphan
 * every job they ever carried, so a departed courier is deactivated instead:
 * their history stands, and they can no longer sign in.
 */
export type StoredRider = RiderState & {
  pinSalt?: string;
  pinHash?: string;
  active?: boolean;
  /**
   * When a provisioned PIN stops working if it has not been used. A temporary
   * credential that lives forever is a permanent one that nobody remembers
   * issuing.
   */
  pinExpiresAt?: string;
};

/**
 * A supervisor, as they exist at rest.
 *
 * The third staff identity, arranged like the other two: credentials here,
 * never on the wire. Supervisors are the only ones who can put a courier on
 * the roster, so this is the account that gates provisioning.
 */
export interface StoredSupervisor {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  active?: boolean;
  passwordSalt?: string;
  passwordHash?: string;
}

/** A supervisor as a client sees them — no credentials. */
export interface SupervisorProfile {
  id: string;
  name: string;
  email: string;
}

/**
 * A bearer session, issued to any of the three audiences.
 *
 * `kind` decides which table `subject` points into — an email in `accounts` or
 * `supervisors`, a rider id in `riders`. One token store rather than three
 * means the expiry sweep, the revoke path and the bearer parsing are written
 * once.
 */
export type SessionKind = 'customer' | 'rider' | 'admin';

export interface StoredSession {
  token: string;
  kind: SessionKind;
  /** Email for a customer or supervisor, rider id for a courier. */
  subject: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * An outstanding setup link — the emailed route from a booking to a password.
 *
 * The raw token is never here. What is stored is its digest, and the row's
 * existence is the whole of the link's validity: spending one deletes it.
 */
export interface StoredSetupToken {
  tokenHash: string;
  bookingId: string;
  /** The address the link was mailed to. */
  email: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * An outstanding tracking token — a guest's right to read one booking.
 *
 * No email, unlike {@link StoredSetupToken}: this grant is about a booking, not
 * about a mailbox, and it never turns into an account. Held as a digest for the
 * same reason.
 */
export interface StoredTrackingToken {
  tokenHash: string;
  bookingId: string;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  reference: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  customer: JobCustomer;
  service: JobService;
  schedule: JobSchedule;
  location: JobLocation;
  dispatch: JobDispatch;
  payment: JobPayment;
}

export interface RiderRow {
  id: string;
  employee_id: string;
  phone: string;
  name: string;
  avatar: string;
  vehicle: string;
  vehicle_plate: string;
  is_online: boolean;
  battery_level: number;
  gps_accuracy: number;
  speed: number;
  heading: number;
  coords: Coords;
  rating: number;
  today_distance: number;
  today_earnings: number;
  completed_count: number;
  on_time_rate: number;
  acceptance_rate: number;
  completion_rate: number;
  pin_salt: string | null;
  pin_hash: string | null;
  must_change_pin: boolean;
  pin_expires_at: string | null;
  active: boolean;
}

export interface AccountRow {
  email: string;
  phone: string;
  name: string;
  created_at: string;
  points: number | null;
  wallet_balance: number | null;
  /**
   * The saved address book, as jsonb. Never null — the column defaults to `[]`
   * — but read defensively in `toAccount` all the same, because a row inserted
   * before the migration ran and read by a server that has it would arrive
   * without the key.
   */
  addresses: SavedAddress[] | null;
  password_salt: string | null;
  password_hash: string | null;
  email_verified: boolean;
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  verification_sent_at: string | null;
  reset_token_hash: string | null;
  reset_expires_at: string | null;
  reset_sent_at: string | null;
  plan_id: string | null;
  plan_started_at: string | null;
  plan_period_start: string | null;
  plan_renews_on: string | null;
  plan_price: number | null;
  plan_pickups_used: number | null;
  plan_cancel_at_end: boolean | null;
  blocked_at: string | null;
  blocked_reason: string | null;
}

export interface SupervisorRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
  active: boolean;
  password_salt: string | null;
  password_hash: string | null;
}

export interface MessageRow {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: string;
  order_id: string | null;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  type: Notification['type'];
  order_id: string | null;
  read: boolean;
}

export interface TransactionRow {
  id: string;
  reference: string;
  booking_id: string | null;
  user_email: string | null;
  amount: number;
  method: string;
  status: PaymentTransaction['status'];
  timestamp: string;
  description: string;
}

export interface AuditEventRow {
  id: string;
  /** `timestamptz`, which `./db` parses to an ISO string on the way out. */
  created_at: string;
  actor: string;
  actor_name: string;
  action: string;
  details: string;
  type: AuditEventType;
  order_id: string | null;
  subject: string | null;
}

export interface SessionRow {
  token: string;
  kind: SessionKind;
  subject: string;
  created_at: string;
  expires_at: string;
}

export interface SetupTokenRow {
  token_hash: string;
  booking_id: string;
  email: string;
  created_at: string;
  expires_at: string;
}

export interface TrackingTokenRow {
  token_hash: string;
  booking_id: string;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

/** Nullable columns become absent fields, which is what the domain types say. */
function opt<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

export function toJob(row: JobRow): Job {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customer: row.customer,
    service: row.service,
    schedule: row.schedule,
    location: row.location,
    dispatch: row.dispatch,
    payment: row.payment,
  };
}

export function toRider(row: RiderRow): StoredRider {
  return {
    id: row.id,
    employeeId: row.employee_id,
    phone: row.phone,
    name: row.name,
    avatar: row.avatar,
    vehicle: row.vehicle,
    vehiclePlate: row.vehicle_plate,
    isOnline: row.is_online,
    batteryLevel: row.battery_level,
    gpsAccuracy: row.gps_accuracy,
    speed: row.speed,
    heading: row.heading,
    coords: row.coords,
    rating: row.rating,
    todayDistance: row.today_distance,
    todayEarnings: row.today_earnings,
    completedCount: row.completed_count,
    onTimeRate: row.on_time_rate,
    acceptanceRate: row.acceptance_rate,
    completionRate: row.completion_rate,
    mustChangePin: row.must_change_pin,
    pinSalt: opt(row.pin_salt),
    pinHash: opt(row.pin_hash),
    pinExpiresAt: opt(row.pin_expires_at),
    active: row.active,
  };
}

export function toAccount(row: AccountRow): StoredAccount {
  return {
    email: row.email,
    phone: row.phone,
    name: row.name,
    createdAt: row.created_at,
    points: opt(row.points),
    walletBalance: opt(row.wallet_balance),
    // Normalised on the way out as well as on the way in. The column is a jsonb
    // blob, so what is in it is whatever the last writer put there — including a
    // row repaired by hand, or one written by a build whose rules differed — and
    // a client should not be the first thing to discover that.
    addresses: normaliseAddresses(row.addresses),
    passwordSalt: opt(row.password_salt),
    passwordHash: opt(row.password_hash),
    emailVerified: row.email_verified,
    verificationTokenHash: opt(row.verification_token_hash),
    verificationExpiresAt: opt(row.verification_expires_at),
    verificationSentAt: opt(row.verification_sent_at),
    resetTokenHash: opt(row.reset_token_hash),
    resetExpiresAt: opt(row.reset_expires_at),
    resetSentAt: opt(row.reset_sent_at),
    plan: toActivePlan(row),
    blockedAt: opt(row.blocked_at),
    blockedReason: opt(row.blocked_reason),
  };
}

/**
 * The membership columns as one record, or null when the account holds none.
 *
 * `plan_id` is the single test for a plan, and an id that no longer names a
 * plan reads as none — the same answer `settleMembership` gives a withdrawn
 * plan, arrived at before anything tries to charge for it.
 */
function toActivePlan(row: AccountRow): ActivePlan | null {
  if (!row.plan_id || !isMembershipPlanId(row.plan_id)) return null;

  const startedAt = row.plan_started_at ?? row.plan_period_start;
  const periodStart = row.plan_period_start ?? row.plan_started_at;
  if (!startedAt || !periodStart || !row.plan_renews_on) return null;

  return {
    planId: row.plan_id,
    startedAt: new Date(startedAt).toISOString(),
    periodStart: new Date(periodStart).toISOString(),
    renewsOn: new Date(row.plan_renews_on).toISOString(),
    price: row.plan_price ?? membershipPlan(row.plan_id)?.price ?? 0,
    pickupsUsed: row.plan_pickups_used ?? 0,
    cancelAtPeriodEnd: row.plan_cancel_at_end ?? false,
  };
}

export function toSupervisor(row: SupervisorRow): StoredSupervisor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    active: row.active,
    passwordSalt: opt(row.password_salt),
    passwordHash: opt(row.password_hash),
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sender: row.sender,
    text: row.text,
    timestamp: row.timestamp,
    orderId: opt(row.order_id),
  };
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    timestamp: row.timestamp,
    type: row.type,
    orderId: opt(row.order_id),
    read: row.read,
  };
}

export function toTransaction(row: TransactionRow): PaymentTransaction {
  return {
    id: row.id,
    reference: row.reference,
    bookingId: opt(row.booking_id),
    userEmail: opt(row.user_email),
    amount: row.amount,
    method: row.method,
    status: row.status,
    timestamp: row.timestamp,
    description: row.description,
  };
}

export function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    at: row.created_at,
    actor: row.actor,
    actorName: row.actor_name,
    action: row.action,
    details: row.details,
    type: row.type,
    orderId: opt(row.order_id),
    subject: opt(row.subject),
  };
}

export function toSession(row: SessionRow): StoredSession {
  return {
    token: row.token,
    kind: row.kind,
    subject: row.subject,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function toSetupToken(row: SetupTokenRow): StoredSetupToken {
  return {
    tokenHash: row.token_hash,
    bookingId: row.booking_id,
    email: row.email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function toTrackingToken(row: TrackingTokenRow): StoredTrackingToken {
  return {
    tokenHash: row.token_hash,
    bookingId: row.booking_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
