/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApiError,
  createClient,
  type AuthSession,
  type Booking,
  type Message,
  type SupervisorProfile,
  type UserAccount,
} from '@freshfold/core';

/**
 * The website's data layer.
 *
 * The dispatch server owns the ledger; this module is the browser's view of
 * it. Three things make that workable without rewriting every screen:
 *
 *  1. **Reads are synchronous.** An in-memory mirror is hydrated from
 *     `localStorage` before React ever renders, so `readBookings()` returns an
 *     array immediately — exactly like the `JSON.parse(localStorage.getItem(…))`
 *     calls it replaced.
 *  2. **Writes are write-through.** They land in the mirror and in
 *     `localStorage` synchronously, then go to the server in the background.
 *     A failed request is queued, not lost.
 *  3. **The server pushes back by polling.** Anything a rider changes on the
 *     road — a status transition, a live position — arrives here within a few
 *     seconds and notifies subscribers.
 *
 * Offline, everything still works against the local mirror; the app degrades
 * to exactly the behaviour it had before there was a server.
 */

const KEYS = {
  bookings: 'freshfold_bookings',
  accounts: 'freshfold_accounts',
  messages: 'freshfold_messages',
  auditLogs: 'freshfold_audit_logs',
  currentUser: 'freshfold_current_user',
  authToken: 'freshfold_auth_token',
  adminToken: 'freshfold_admin_token',
  adminSupervisor: 'freshfold_admin_supervisor',
  queue: 'freshfold_pending_writes',
} as const;

const POLL_INTERVAL_MS = 5000;

/** Same-origin: Vite proxies `/api` to the dispatch server in dev, and in
 *  production the server serves this bundle itself. */
export const api = createClient({ baseUrl: '' });

/** Admin-only activity trail. Owned by the dashboard, never leaves the browser. */
export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  supervisor: string;
  type: 'stage' | 'payment' | 'points' | 'system';
}

type Listener = () => void;

interface Mirror {
  bookings: Booking[];
  accounts: UserAccount[];
  messages: Message[];
  auditLogs: AuditLog[];
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — the mirror is still authoritative
    // for this session, so carry on rather than breaking the page.
  }
}

const mirror: Mirror = {
  bookings: readLocal<Booking[]>(KEYS.bookings, []),
  accounts: readLocal<UserAccount[]>(KEYS.accounts, []),
  messages: readLocal<Message[]>(KEYS.messages, []),
  auditLogs: readLocal<AuditLog[]>(KEYS.auditLogs, []),
};

const listeners = new Set<Listener>();
let online = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to any change — local write or server poll. Returns an unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isOnline(): boolean {
  return online;
}

// ---------------------------------------------------------------------------
// Offline write queue
// ---------------------------------------------------------------------------

type PendingWrite =
  | { kind: 'booking:create'; booking: Booking }
  | { kind: 'booking:patch'; id: string; patch: Partial<Booking> }
  | { kind: 'booking:delete'; id: string }
  | { kind: 'account:upsert'; account: UserAccount }
  | { kind: 'message:send'; message: Message };

let queue: PendingWrite[] = readLocal<PendingWrite[]>(KEYS.queue, []);
/** Non-zero while a write is in flight, so a poll can't clobber a fresh edit. */
let inFlight = 0;

function enqueue(write: PendingWrite): void {
  queue.push(write);
  writeLocal(KEYS.queue, queue);
  void drain();
}

async function send(write: PendingWrite): Promise<void> {
  switch (write.kind) {
    case 'booking:create':
      await api.createBooking(write.booking);
      return;
    case 'booking:patch':
      await api.updateBooking(write.id, write.patch);
      return;
    case 'booking:delete':
      await api.deleteBooking(write.id);
      return;
    case 'account:upsert':
      await api.upsertAccount(write.account);
      return;
    case 'message:send':
      await api.postMessage(write.message);
      return;
  }
}

/**
 * Whether a failed write is worth retrying.
 *
 * A dropped connection is temporary and the write should wait. A rejection is
 * not: the commonest case is a booking deleted from the supervisor ledger while
 * an edit for it sat in the queue, and that write can never succeed. Timeouts
 * and rate limits are the two 4xx codes that *do* clear on their own.
 */
function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 408 || error.status === 429) return false;
  return error.status >= 400 && error.status < 500;
}

let draining = false;

async function drain(): Promise<void> {
  if (draining || queue.length === 0) return;
  draining = true;
  inFlight += 1;

  try {
    while (queue.length > 0) {
      const [next] = queue;
      try {
        await send(next);
      } catch (error) {
        if (isPermanentFailure(error)) {
          // The server will never accept this one — most often because the
          // order was deleted from the supervisor ledger while this write sat
          // in the queue. Retrying forever would wedge the queue and block
          // every later write from this browser, so it is dropped and we carry
          // on. We are still online; this was a rejection, not a timeout.
          online = true;
          queue.shift();
          writeLocal(KEYS.queue, queue);
          continue;
        }

        // Server unreachable. Keep the write for the next attempt and stop
        // draining — order matters, so we don't skip ahead.
        online = false;
        return;
      }
      queue.shift();
      writeLocal(KEYS.queue, queue);
    }
    online = true;
  } finally {
    draining = false;
    inFlight -= 1;
  }
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export function readBookings(): Booking[] {
  return mirror.bookings;
}

export function readBooking(id: string): Booking | undefined {
  return mirror.bookings.find((booking) => booking.id === id);
}

/**
 * Replace the whole ledger. Several screens already work this way — they build
 * a new array and hand it over — so this keeps that shape.
 *
 * The array is diffed into per-booking writes rather than sent as a wholesale
 * replacement. That matters: this browser's mirror is not necessarily the whole
 * ledger (it may not have synced yet, or the server may hold jobs a rider
 * created), and a blind replace would delete records this tab had never seen.
 * Deleting by omission only ever removes something we knew about.
 */
export function writeBookings(next: Booking[]): void {
  const before = new Map(mirror.bookings.map((booking) => [booking.id, booking]));
  const after = new Map(next.map((booking) => [booking.id, booking]));

  // Always a new array. Callers routinely mutate the array they got back from
  // `readBookings()` and hand it straight back; without the copy the reference
  // would be unchanged and React would skip the re-render.
  mirror.bookings = [...next];
  writeLocal(KEYS.bookings, mirror.bookings);

  for (const [id, booking] of after) {
    const previous = before.get(id);
    if (!previous) enqueue({ kind: 'booking:create', booking });
    else if (JSON.stringify(previous) !== JSON.stringify(booking)) {
      enqueue({ kind: 'booking:patch', id, patch: booking });
    }
  }

  for (const id of before.keys()) {
    if (!after.has(id)) enqueue({ kind: 'booking:delete', id });
  }

  notify();
}

export function createBooking(booking: Booking): void {
  mirror.bookings = [booking, ...mirror.bookings.filter((b) => b.id !== booking.id)];
  writeLocal(KEYS.bookings, mirror.bookings);
  enqueue({ kind: 'booking:create', booking });
  notify();
}

export function patchBooking(id: string, patch: Partial<Booking>): void {
  mirror.bookings = mirror.bookings.map((booking) =>
    booking.id === id ? { ...booking, ...patch } : booking
  );
  writeLocal(KEYS.bookings, mirror.bookings);
  enqueue({ kind: 'booking:patch', id, patch });
  notify();
}

export function deleteBooking(id: string): void {
  mirror.bookings = mirror.bookings.filter((booking) => booking.id !== id);
  writeLocal(KEYS.bookings, mirror.bookings);
  enqueue({ kind: 'booking:delete', id });
  notify();
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function readAccounts(): UserAccount[] {
  return mirror.accounts;
}

/**
 * Same diffing rationale as `writeBookings`, minus the deletions: no screen
 * removes an account, so an id missing from the array means "this tab hasn't
 * seen it", never "delete it".
 */
export function writeAccounts(next: UserAccount[]): void {
  const before = new Map(
    mirror.accounts.map((account) => [account.email.toLowerCase(), account])
  );

  mirror.accounts = [...next];
  writeLocal(KEYS.accounts, mirror.accounts);

  for (const account of next) {
    const previous = before.get(account.email.toLowerCase());
    if (!previous || JSON.stringify(previous) !== JSON.stringify(account)) {
      enqueue({ kind: 'account:upsert', account });
    }
  }

  notify();
}

/**
 * Suspends a customer, or lifts the suspension. Supervisor desk only.
 *
 * Unlike the writes above this one is not queued: it carries the desk's token,
 * which the offline queue has no way to attach, and a block replayed out of
 * order hours later is not something anybody asked for. It goes to the server
 * or it fails in front of the supervisor who pressed the button — the mirror is
 * only updated once the server has agreed.
 */
export async function setAccountBlocked(
  email: string,
  blocked: boolean,
  reason?: string
): Promise<UserAccount> {
  const token = readAdminToken();
  if (!token) throw new Error('Sign in to the supervisor desk to change an account.');

  const updated = await api.setAccountBlocked(email, { blocked, reason }, token);

  mirror.accounts = mirror.accounts.map((account) =>
    account.email.toLowerCase() === email.toLowerCase()
      ? // The reason stays on the desk that set it and out of the mirror, which
        // is written to localStorage and shared with every other pane.
        { ...account, ...updated, blockedReason: undefined }
      : account
  );
  writeLocal(KEYS.accounts, mirror.accounts);
  notify();

  return updated;
}

/**
 * Erases a customer account. Supervisor desk only.
 *
 * Any queued write for that address is dropped first. Without that, an upsert
 * still sitting in the queue — a points adjustment made a moment earlier, say —
 * would drain afterwards and recreate the row that was just deleted.
 */
export async function deleteAccount(email: string): Promise<void> {
  const token = readAdminToken();
  if (!token) throw new Error('Sign in to the supervisor desk to delete an account.');

  await api.deleteAccount(email, token);

  queue = queue.filter(
    (write) =>
      write.kind !== 'account:upsert' ||
      write.account.email.toLowerCase() !== email.toLowerCase()
  );
  writeLocal(KEYS.queue, queue);

  mirror.accounts = mirror.accounts.filter(
    (account) => account.email.toLowerCase() !== email.toLowerCase()
  );
  writeLocal(KEYS.accounts, mirror.accounts);
  notify();
}

export function upsertAccount(account: UserAccount): void {
  const index = mirror.accounts.findIndex(
    (candidate) => candidate.email.toLowerCase() === account.email.toLowerCase()
  );

  if (index >= 0) mirror.accounts[index] = { ...mirror.accounts[index], ...account };
  else mirror.accounts.push(account);

  mirror.accounts = [...mirror.accounts];
  writeLocal(KEYS.accounts, mirror.accounts);
  enqueue({ kind: 'account:upsert', account });
  notify();
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * The order thread, as this browser knows it.
 *
 * One conversation per job, shared with the rider app and the dispatch desk.
 * Reads are synchronous off the mirror like everything else here; the poll in
 * `pull()` is what brings the rider's side of it in.
 */
export function readMessages(orderId?: string): Message[] {
  if (!orderId) return mirror.messages;
  return mirror.messages.filter((message) => message.orderId === orderId);
}

/**
 * Post to a job's thread as the customer.
 *
 * The id is minted here rather than by the server so the bubble can appear the
 * instant it is typed. The server's insert is `on conflict do nothing`, so a
 * queued resend after a dropped connection lands as the same message rather
 * than a duplicate.
 */
export function sendMessage(text: string, orderId: string): Message {
  const message: Message = {
    id: `msg-customer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sender: 'customer',
    text,
    timestamp: nowLabel(),
    orderId,
  };

  mirror.messages = [...mirror.messages, message];
  writeLocal(KEYS.messages, mirror.messages);
  enqueue({ kind: 'message:send', message });
  notify();

  return message;
}

/** Same clock label the rider app and the server stamp messages with. */
function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

/**
 * Wallet balance lives on the server account record, with a per-email
 * localStorage key kept in step so a reload before the first sync still shows
 * the right number.
 */
export function readWallet(email: string): number | null {
  const account = mirror.accounts.find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
  );
  if (account?.walletBalance !== undefined) return account.walletBalance;

  const raw = localStorage.getItem(walletKey(email));
  return raw === null ? null : Number(raw);
}

export function writeWallet(email: string, balance: number): void {
  try {
    localStorage.setItem(walletKey(email), String(balance));
  } catch {
    /* see writeLocal */
  }

  const account = mirror.accounts.find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
  );
  if (account) upsertAccount({ ...account, walletBalance: balance });
}

function walletKey(email: string): string {
  return `freshfold_wallet_${email.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Passwords are never held here.
 *
 * The portal used to pull the whole account table into the browser and compare
 * the password locally, which meant the server had to hand every visitor every
 * credential. Now the password goes to `/api/auth/*` and comes back as a bearer
 * token; the only things this module keeps are that token and the signed-in
 * profile, both scoped to this browser.
 */

/** Who is signed in on *this* browser. */
export function readCurrentUser(): UserAccount | null {
  return readLocal<UserAccount | null>(KEYS.currentUser, null);
}

export function writeCurrentUser(account: UserAccount): void {
  writeLocal(KEYS.currentUser, account);
}

export function readAuthToken(): string | null {
  return localStorage.getItem(KEYS.authToken);
}

function writeSession(session: AuthSession): UserAccount {
  try {
    localStorage.setItem(KEYS.authToken, session.token);
  } catch {
    /* see writeLocal */
  }
  writeCurrentUser(session.account);
  return session.account;
}

export async function register(payload: {
  email: string;
  phone: string;
  name: string;
  password: string;
}): Promise<UserAccount> {
  return writeSession(await api.register(payload));
}

export async function login(identifier: string, password: string): Promise<UserAccount> {
  return writeSession(await api.login({ identifier, password }));
}

/**
 * The booking an emailed setup link belongs to.
 *
 * Read from the server rather than from the local mirror, and not by booking
 * id: the token is what names the order, and it is also the only thing that
 * proves the person holding it is the customer the confirmation went to.
 * Throws on a link that is spent, expired or invented.
 */
export async function readSetupLink(
  token: string
): Promise<{ id: string; name: string; email: string; phone: string }> {
  return (await api.setupLinkBooking(token)).booking;
}

/** Spends a setup link, setting the account's first password and signing in. */
export async function claimBooking(token: string, password: string): Promise<UserAccount> {
  return writeSession(await api.claimBooking({ token, password }));
}

/**
 * Mails the setup link again to the address on a booking.
 *
 * Unable to report whether it found anything, for the reason
 * `requestPasswordReset` is: the server answers a contact it has never seen
 * exactly as it answers a real one. Throws only when the request could not be
 * made at all.
 */
export async function requestSetupLink(identifier: string): Promise<void> {
  await api.requestSetupLink(identifier);
}

/** Whether a contact already has a login, so the UI can offer the right path. */
export async function authStatus(
  identifier: string
): Promise<{ exists: boolean; hasPassword: boolean }> {
  return api.authStatus(identifier);
}

/**
 * Asks for another email-confirmation link.
 *
 * Throws when there is no session, when the address is already confirmed, or
 * when pressed inside the server's cooldown — the caller shows the message.
 */
export async function resendVerification(): Promise<void> {
  const token = readAuthToken();
  if (!token) throw new Error('Sign in to request a new link.');
  await api.resendVerification(token);
}

/**
 * Mails a password-reset link to whatever address is on the account.
 *
 * Deliberately not authenticated, and deliberately unable to report whether it
 * found anything: somebody who cannot sign in is the only caller, and the
 * server answers a contact it has never seen exactly as it answers a real one.
 * Throws only when the request could not be made at all.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  await api.requestPasswordReset(identifier);
}

export async function logout(): Promise<void> {
  const token = readAuthToken();
  clearCurrentUser();
  if (token) {
    try {
      await api.logout(token);
    } catch {
      // Already signed out locally; a failed revoke just leaves a token to
      // expire on its own.
    }
  }
}

/**
 * Re-validates the stored token on load. A token the server no longer honours
 * means the cached profile is stale, so the session is dropped rather than
 * leaving the portal showing someone who is not really signed in.
 */
export async function restoreSession(): Promise<UserAccount | null> {
  const token = readAuthToken();
  if (!token) return null;

  try {
    const account = await api.me(token);
    writeCurrentUser(account);
    return account;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearCurrentUser();
      return null;
    }
    // Server unreachable — keep the cached profile rather than signing the
    // customer out every time their connection drops.
    return readCurrentUser();
  }
}

export function clearCurrentUser(): void {
  localStorage.removeItem(KEYS.currentUser);
  localStorage.removeItem(KEYS.authToken);
}

// ---------------------------------------------------------------------------
// Supervisor desk
// ---------------------------------------------------------------------------

/**
 * The dashboard's own session, kept apart from the customer one.
 *
 * A browser can legitimately be both — a supervisor who is also a customer —
 * so the two tokens live under different keys rather than overwriting each
 * other. `kind` on the server keeps them from being used interchangeably.
 */
export function readAdminToken(): string | null {
  return localStorage.getItem(KEYS.adminToken);
}

export function readAdminSupervisor(): SupervisorProfile | null {
  return readLocal<SupervisorProfile | null>(KEYS.adminSupervisor, null);
}

export async function adminLogin(
  email: string,
  password: string
): Promise<SupervisorProfile> {
  const session = await api.adminLogin({ email, password });

  try {
    localStorage.setItem(KEYS.adminToken, session.token);
  } catch {
    /* see writeLocal */
  }
  writeLocal(KEYS.adminSupervisor, session.supervisor);

  return session.supervisor;
}

/**
 * Re-validates the stored desk token on load. A token the server no longer
 * honours means the dashboard must not open, so unlike the customer session
 * this does *not* fall back to the cached profile when the server is
 * unreachable — an unverifiable supervisor is not a supervisor.
 */
export async function restoreAdminSession(): Promise<SupervisorProfile | null> {
  const token = readAdminToken();
  if (!token) return null;

  try {
    const supervisor = await api.adminMe(token);
    writeLocal(KEYS.adminSupervisor, supervisor);
    return supervisor;
  } catch {
    clearAdminSession();
    return null;
  }
}

export async function adminLogout(): Promise<void> {
  const token = readAdminToken();
  clearAdminSession();
  if (token) {
    try {
      await api.adminLogout(token);
    } catch {
      /* Already signed out locally; the token expires on its own. */
    }
  }
}

export function clearAdminSession(): void {
  localStorage.removeItem(KEYS.adminToken);
  localStorage.removeItem(KEYS.adminSupervisor);
}

// ---------------------------------------------------------------------------
// Audit log — deliberately local
// ---------------------------------------------------------------------------

export function readAuditLogs(): AuditLog[] {
  return mirror.auditLogs;
}

export function writeAuditLogs(next: AuditLog[]): void {
  mirror.auditLogs = next;
  writeLocal(KEYS.auditLogs, next);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Pull the server's view into the mirror.
 *
 * Skipped while a write is in flight: the response would predate the edit that
 * is still on the wire, and applying it would make the UI flicker backwards.
 */
export async function pull(): Promise<void> {
  if (inFlight > 0) return;

  try {
    const [bookings, accounts, messages] = await Promise.all([
      api.listBookings(),
      api.listAccounts(),
      api.listMessages(),
    ]);
    online = true;

    if (inFlight > 0) return;

    mirror.bookings = bookings;
    mirror.accounts = accounts;
    mirror.messages = messages;
    writeLocal(KEYS.bookings, bookings);
    writeLocal(KEYS.accounts, accounts);
    writeLocal(KEYS.messages, messages);
    notify();
  } catch {
    // The server is down or we're offline. The mirror stands.
    online = false;
  }
}

/** Starts polling. Safe to call more than once. Returns a stop function. */
export function startSync(): () => void {
  void drain();
  void pull();

  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void drain();
      void pull();
    }, POLL_INTERVAL_MS);
  }

  return () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}
