/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createClient,
  type Booking,
  type PaymentTransaction,
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
  auditLogs: 'freshfold_audit_logs',
  currentUser: 'freshfold_current_user',
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
  | { kind: 'transaction'; transaction: PaymentTransaction };

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
    case 'transaction':
      await api.recordTransaction(write.transaction);
      return;
  }
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
      } catch {
        // Server unreachable or rejecting. Keep the write for the next attempt
        // and stop draining — order matters, so we don't skip ahead.
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
// Session & audit log — deliberately local
// ---------------------------------------------------------------------------

/** Who is signed in on *this* browser. Never leaves the device. */
export function readCurrentUser(): UserAccount | null {
  return readLocal<UserAccount | null>(KEYS.currentUser, null);
}

export function writeCurrentUser(account: UserAccount): void {
  writeLocal(KEYS.currentUser, account);
}

export function clearCurrentUser(): void {
  localStorage.removeItem(KEYS.currentUser);
}

export function readAuditLogs(): AuditLog[] {
  return mirror.auditLogs;
}

export function writeAuditLogs(next: AuditLog[]): void {
  mirror.auditLogs = next;
  writeLocal(KEYS.auditLogs, next);
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export function recordTransaction(transaction: PaymentTransaction): void {
  enqueue({ kind: 'transaction', transaction });
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
    const [bookings, accounts] = await Promise.all([api.listBookings(), api.listAccounts()]);
    online = true;

    if (inFlight > 0) return;

    mirror.bookings = bookings;
    mirror.accounts = accounts;
    writeLocal(KEYS.bookings, bookings);
    writeLocal(KEYS.accounts, accounts);
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
