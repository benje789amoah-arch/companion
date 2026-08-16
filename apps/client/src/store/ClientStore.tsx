/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  bookingProgressPercent,
  bookingWithKnownProof,
  isTerminal,
  membershipPlan,
  newJobId,
  type ActivePlan,
  type Booking,
  type Coords,
  type JobStatus,
  type LaundryBag,
  type Message,
  type Notification,
  type PaymentTransaction,
  type UserAccount,
} from '@freshfold/core';
import { api } from '../services/api';
import { STORAGE_KEYS, readJson, remove, writeJson } from '../services/storage';
import { useSession } from './SessionStore';

/**
 * The customer app's data layer.
 *
 * Modelled on `apps/web/src/services/store.ts` and subject to the same three
 * rules, adapted for a device:
 *
 *  1. **Reads are synchronous.** The mirror is hydrated from AsyncStorage once
 *     at startup — `hydrated` gates the first paint — and every read after that
 *     comes out of memory.
 *  2. **Writes are write-through.** They land in the mirror and in storage
 *     immediately, then go to the server in the background. A failed write is
 *     queued in order, not lost.
 *  3. **The server pushes back by polling.** A rider's progress on the road
 *     arrives here within a few seconds.
 *
 * With the server unreachable the app still books, still shows history and
 * still queues its writes — it just cannot see the courier move.
 */

const POLL_INTERVAL_MS = 4000;

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

/** A saved pickup address, local to the device. */
export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  suburb: string;
  city?: string;
  /**
   * The doorstep the customer pinned for this address. Optional because
   * addresses saved before pins existed do not have one — those fall back to
   * the derived point until the customer places a pin and saves again.
   */
  coords?: Coords;
  isDefault?: boolean;
}

/**
 * The membership lives on the account now, not on the device.
 *
 * `ActivePlan` moved to `@freshfold/core` and is re-exported here so the
 * screens that import it from this module keep working. What changed is where
 * the value comes from: it is read off `account.plan`, which the server owns
 * and settles, rather than out of AsyncStorage where anyone could write one and
 * where a reinstall threw a paid plan away.
 */
export type { ActivePlan };

type PendingWrite =
  | { kind: 'booking:create'; booking: Booking }
  | { kind: 'booking:patch'; id: string; patch: Partial<Booking> }
  | { kind: 'booking:delete'; id: string }
  | { kind: 'account:upsert'; account: UserAccount }
  | { kind: 'message:post'; message: Message }
  | { kind: 'notification:read'; id: string }
  | { kind: 'transaction:record'; transaction: PaymentTransaction }
  | {
      kind: 'order:status';
      id: string;
      patch: {
        status: JobStatus;
        signature?: string;
        photo?: string;
        bags?: LaundryBag[];
        /** Proves the customer accepted the handover themselves. */
        deliveryCode?: string;
      };
    };

interface Mirror {
  bookings: Booking[];
  messages: Message[];
  notifications: Notification[];
  transactions: PaymentTransaction[];
  addresses: SavedAddress[];
  /** Ids booked on this device, so a signed-out visitor can still track them. */
  localIds: string[];
  /** Bag manifests the customer has personally verified, per job. */
  verifiedBags: Record<string, string[]>;
}

const EMPTY_MIRROR: Mirror = {
  bookings: [],
  messages: [],
  notifications: [],
  transactions: [],
  addresses: [],
  localIds: [],
  verifiedBags: {},
};

/** What a subscribe attempt did, so the sheet can say something specific. */
export type SubscribeResult =
  | { ok: true; charged: number; credit: number }
  | { ok: false; reason: 'signed-out' | 'insufficient-funds' | 'offline' | 'rejected'; shortfall?: number; message: string };

/** What a redemption did. `shortfall` is in points, not cedis. */
export type RedeemResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'signed-out' | 'insufficient-points' | 'offline' | 'rejected';
      shortfall?: number;
      message: string;
    };

interface ClientState extends Mirror {
  hydrated: boolean;
  online: boolean;
  /** Bookings still in flight, newest first. */
  activeBookings: Booking[];
  /** Delivered or cancelled, newest first. */
  pastBookings: Booking[];
  /** The one the home screen and the tracking tab focus on. */
  primaryBooking: Booking | null;
  unreadCount: number;
  walletBalance: number;
  points: number;

  /** The membership on the account, as the server last settled it. */
  plan: ActivePlan | null;
  /** Included pickups left in the period now running. */
  includedPickupsLeft: number;
  /** True once cancelled: the plan runs to `plan.renewsOn` and then stops. */
  planEndsOn: string | null;

  createBooking: (booking: Booking) => Promise<Booking>;
  patchBooking: (id: string, patch: Partial<Booking>) => void;
  cancelBooking: (id: string) => void;
  bookingById: (id: string) => Booking | undefined;
  /**
   * Fetches one order in full, which is the only way to get its proof-of-service
   * photographs — the polled list leaves them behind so it stays small enough to
   * ask for every four seconds. Safe to call repeatedly; the order screen calls
   * it on open.
   */
  loadBookingProof: (id: string) => Promise<void>;
  messagesFor: (orderId: string) => Message[];

  sendMessage: (orderId: string, text: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  /** Records the customer's own scan-through of their bag manifest. */
  verifyBags: (orderId: string, bags: LaundryBag[]) => void;
  /** Signature + handover code at the door. Returns false on a wrong code. */
  confirmDelivery: (orderId: string, signature: string, code: string) => Promise<boolean>;
  /** Attaches a photo and a note to the job's conversation. */
  reportIssue: (orderId: string, note: string, photoUri?: string) => void;

  /**
   * Credits the wallet after a settled payment. The server writes the balance
   * and the statement row; nothing is computed on the device.
   */
  topUpWallet: (amount: number, method: string) => Promise<void>;
  /**
   * Debits the wallet and earns the point-per-cedi that spend is worth.
   * Resolves false when the balance will not cover it.
   */
  chargeWallet: (amount: number, description: string, bookingId?: string) => Promise<boolean>;
  /** Spends care points on a reward from the shared catalogue. */
  redeemReward: (rewardId: string) => Promise<RedeemResult>;
  recordTransaction: (transaction: PaymentTransaction) => void;
  /**
   * Starts or switches a plan. The server prices it — including the credit for
   * an unused part of a running plan — debits the wallet once and writes the
   * one ledger entry.
   */
  subscribeToPlan: (planId: string) => Promise<SubscribeResult>;
  /** Cancels at the end of the paid period. Returns the date it ends. */
  cancelPlan: () => Promise<string | null>;
  /** Reverses a pending cancellation while the period is still running. */
  resumePlan: () => Promise<boolean>;

  saveAddress: (address: SavedAddress) => void;
  removeAddress: (id: string) => void;
  defaultAddress: SavedAddress | null;

  refresh: () => Promise<void>;
}

const ClientContext = createContext<ClientState | null>(null);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { account, isAuthenticated, applyAccount, token } = useSession();

  const [mirror, setMirror] = useState<Mirror>(EMPTY_MIRROR);
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(false);

  const queueRef = useRef<PendingWrite[]>([]);
  const drainingRef = useRef(false);
  /** Non-zero while a write is on the wire, so a poll can't clobber a fresh edit. */
  const inFlightRef = useRef(0);
  const emailRef = useRef<string | undefined>(undefined);
  const tokenRef = useRef<string | null>(null);

  emailRef.current = account?.email;
  tokenRef.current = token;

  /** Mutate the mirror and persist the slices that changed. */
  const commit = useCallback((update: (current: Mirror) => Mirror) => {
    setMirror((current) => {
      const next = update(current);
      if (next === current) return current;

      if (next.bookings !== current.bookings) void writeJson(STORAGE_KEYS.bookings, next.bookings);
      if (next.messages !== current.messages) void writeJson(STORAGE_KEYS.messages, next.messages);
      if (next.notifications !== current.notifications) {
        void writeJson(STORAGE_KEYS.notifications, next.notifications);
      }
      if (next.transactions !== current.transactions) {
        void writeJson(STORAGE_KEYS.transactions, next.transactions);
      }
      if (next.addresses !== current.addresses) {
        void writeJson(STORAGE_KEYS.addresses, next.addresses);
      }

      return next;
    });
  }, []);

  // ------------------------------------------------------------------ queue

  const send = useCallback(async (write: PendingWrite): Promise<void> => {
    switch (write.kind) {
      case 'booking:create':
        // Sent with the session when there is one: the server reads the
        // customer's membership off the token to decide dispatch priority and
        // to spend an included pickup. A queued booking replayed after a
        // sign-out simply goes up as a visitor's.
        await api.createBooking(write.booking, tokenRef.current);
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
      case 'message:post':
        await api.postMessage(write.message);
        return;
      case 'notification:read':
        await api.markNotificationRead(write.id);
        return;
      case 'transaction:record':
        await api.recordTransaction(write.transaction);
        return;
      case 'order:status':
        await api.updateOrderStatus(write.id, write.patch);
        return;
    }
  }, []);

  const drain = useCallback(async (): Promise<void> => {
    if (drainingRef.current || queueRef.current.length === 0) return;
    drainingRef.current = true;
    inFlightRef.current += 1;

    try {
      while (queueRef.current.length > 0) {
        const [next] = queueRef.current;
        try {
          await send(next);
        } catch (error) {
          if (isPermanentFailure(error)) {
            // The server will never accept this one — most often because the
            // order was deleted from the supervisor ledger while this write sat
            // in the queue. Retrying forever would wedge the queue and block
            // every later write from this device, so it is dropped and we carry
            // on. We are still online; this was a rejection, not a timeout.
            setOnline(true);
            queueRef.current = queueRef.current.slice(1);
            void writeJson(STORAGE_KEYS.queue, queueRef.current);
            continue;
          }

          // Server unreachable. Keep the write for the next attempt and stop —
          // order matters, so we don't skip ahead.
          setOnline(false);
          return;
        }
        queueRef.current = queueRef.current.slice(1);
        void writeJson(STORAGE_KEYS.queue, queueRef.current);
      }
      setOnline(true);
    } finally {
      drainingRef.current = false;
      inFlightRef.current -= 1;
    }
  }, [send]);

  const enqueue = useCallback(
    (write: PendingWrite) => {
      queueRef.current = [...queueRef.current, write];
      void writeJson(STORAGE_KEYS.queue, queueRef.current);
      void drain();
    },
    [drain]
  );

  // --------------------------------------------------------------- hydrate

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [bookings, messages, notifications, transactions, addresses, queue] =
        await Promise.all([
          readJson<Booking[]>(STORAGE_KEYS.bookings, []),
          readJson<Message[]>(STORAGE_KEYS.messages, []),
          readJson<Notification[]>(STORAGE_KEYS.notifications, []),
          readJson<PaymentTransaction[]>(STORAGE_KEYS.transactions, []),
          readJson<SavedAddress[]>(STORAGE_KEYS.addresses, []),
          readJson<PendingWrite[]>(STORAGE_KEYS.queue, []),
        ]);

      if (cancelled) return;

      // The device-local membership this build replaced. Dropping it is the
      // point: the account carries the real one, and a leftover here would show
      // a plan the server will not honour.
      void remove(STORAGE_KEYS.legacyPlan);

      queueRef.current = queue;
      setMirror({
        ...EMPTY_MIRROR,
        bookings,
        messages,
        notifications,
        transactions,
        addresses,
        localIds: bookings.map((booking) => booking.id),
      });
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------ pull

  /** Ids we already know about, readable from inside `pull` without a re-bind. */
  const mirrorIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    mirrorIdsRef.current = new Set(mirror.localIds);
  }, [mirror.localIds]);

  const pull = useCallback(async (): Promise<void> => {
    if (inFlightRef.current > 0) return;

    const email = emailRef.current;

    try {
      // Bookings are scoped server-side when we know who is signed in; a guest
      // gets the open list and keeps only the jobs booked on this device.
      //
      // The courier roster is deliberately not fetched. Everything the customer
      // is allowed to know about their rider — name, vehicle, plate, rating,
      // position, ETA — already rides on `booking.rider`, and pulling the staff
      // list every four seconds to look up something already in hand is how a
      // roster leaks to every customer device.
      const [bookings, notifications] = await Promise.all([
        api.listBookings(email ? { email } : undefined),
        api.listNotifications(),
      ]);

      if (inFlightRef.current > 0) return;

      commit((current) => {
        const known = new Set(current.localIds);
        const visible = email
          ? bookings
          : bookings.filter((booking) => known.has(booking.id));

        // The list answers without proof photographs, so anything already
        // fetched for the order screen is carried across the refresh rather
        // than blinking out every four seconds.
        const held = new Map(current.bookings.map((booking) => [booking.id, booking]));

        return {
          ...current,
          bookings: visible.map((booking) =>
            bookingWithKnownProof(booking, held.get(booking.id))
          ),
          notifications: notifications.filter(
            (notification) => !notification.orderId || visible.some((b) => b.id === notification.orderId)
          ),
          localIds: Array.from(new Set([...current.localIds, ...visible.map((b) => b.id)])),
        };
      });

      setOnline(true);

      // The conversation and the ledger are only worth fetching once we know
      // which jobs are ours, so they ride a second round-trip.
      const ids = new Set(
        (email ? bookings : bookings.filter((b) => mirrorIdsRef.current.has(b.id))).map((b) => b.id)
      );

      if (ids.size > 0) {
        const threads = await Promise.all(
          Array.from(ids).map((id) =>
            api.listMessages({ orderId: id }).catch(() => [] as Message[])
          )
        );
        if (inFlightRef.current > 0) return;
        commit((current) => ({ ...current, messages: threads.flat() }));
      }

      if (email) {
        const transactions = await api.listTransactions({ email }).catch(() => null);
        if (transactions && inFlightRef.current === 0) {
          commit((current) => ({ ...current, transactions }));
        }
      }

      // Re-reading the account is what makes a membership renew.
      //
      // There is no scheduler on the server: `/auth/me` settles the plan before
      // it answers, so the month rolling over — or the wallet running dry and
      // the plan lapsing — lands here on the next poll rather than whenever
      // somebody happens to open the plans sheet. It carries the wallet balance
      // the renewal left behind, too.
      const bearer = tokenRef.current;
      if (bearer && inFlightRef.current === 0) {
        const fresh = await api.me(bearer).catch(() => null);
        if (fresh && inFlightRef.current === 0) applyAccount(fresh);
      }
    } catch {
      // The server is down or we're offline. The mirror stands.
      setOnline(false);
    }
  }, [commit, applyAccount]);

  useEffect(() => {
    if (!hydrated) return;

    void drain();
    void pull();

    const timer = setInterval(() => {
      void drain();
      void pull();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hydrated, drain, pull]);

  // Signing in or out changes which jobs are ours, so re-pull immediately
  // rather than waiting out the poll interval.
  useEffect(() => {
    if (hydrated) void pull();
  }, [isAuthenticated, account?.email, hydrated, pull]);

  // --------------------------------------------------------------- actions

  const createBooking = useCallback<ClientState['createBooking']>(
    async (booking) => {
      const withId: Booking = { ...booking, id: booking.id || newJobId() };

      commit((current) => ({
        ...current,
        bookings: [withId, ...current.bookings.filter((b) => b.id !== withId.id)],
        localIds: Array.from(new Set([withId.id, ...current.localIds])),
      }));

      enqueue({ kind: 'booking:create', booking: withId });
      return withId;
    },
    [commit, enqueue]
  );

  const patchBooking = useCallback<ClientState['patchBooking']>(
    (id, patch) => {
      commit((current) => ({
        ...current,
        bookings: current.bookings.map((booking) =>
          booking.id === id ? { ...booking, ...patch } : booking
        ),
      }));
      enqueue({ kind: 'booking:patch', id, patch });
    },
    [commit, enqueue]
  );

  /**
   * Cancelling keeps the record. The website's admin dashboard and the
   * customer's own history both need to see that an order existed and was
   * called off, which a delete would erase.
   */
  const cancelBooking = useCallback<ClientState['cancelBooking']>(
    (id) => {
      patchBooking(id, { status: 'Cancelled' });
    },
    [patchBooking]
  );

  const sendMessage = useCallback<ClientState['sendMessage']>(
    (orderId, text) => {
      const message: Message = {
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sender: 'customer',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        orderId,
      };

      commit((current) => ({ ...current, messages: [...current.messages, message] }));
      enqueue({ kind: 'message:post', message });
    },
    [commit, enqueue]
  );

  const markNotificationRead = useCallback<ClientState['markNotificationRead']>(
    (id) => {
      commit((current) => ({
        ...current,
        notifications: current.notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification
        ),
      }));
      enqueue({ kind: 'notification:read', id });
    },
    [commit, enqueue]
  );

  const markAllNotificationsRead = useCallback(() => {
    const unread = mirror.notifications.filter((notification) => !notification.read);
    commit((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({ ...notification, read: true })),
    }));
    for (const notification of unread) enqueue({ kind: 'notification:read', id: notification.id });
  }, [mirror.notifications, commit, enqueue]);

  /**
   * The customer's own pass over the bag manifest.
   *
   * Deliberately not a dispatch write: the rider owns `bags` on the job record,
   * and two surfaces writing the same field would race. What the customer's
   * scan produces is a note in the shared conversation — visible to the rider
   * and to dispatch — plus a local record of which codes they checked.
   */
  const verifyBags = useCallback<ClientState['verifyBags']>(
    (orderId, bags) => {
      const scanned = bags.filter((bag) => bag.scanned);

      commit((current) => ({
        ...current,
        verifiedBags: { ...current.verifiedBags, [orderId]: scanned.map((bag) => bag.qrCode) },
      }));

      sendMessage(
        orderId,
        `Bag manifest verified on my side: ${scanned.map((bag) => bag.qrCode).join(', ')} (${scanned.length}/${bags.length}).`
      );
    },
    [commit, sendMessage]
  );

  const confirmDelivery = useCallback<ClientState['confirmDelivery']>(
    async (orderId, signature, code) => {
      // This order's own code, not a constant every order in the system
      // shares. The server checks it again on the way through.
      const booking = mirror.bookings.find((candidate) => candidate.id === orderId);
      if (!booking?.deliveryOtp || code.trim() !== booking.deliveryOtp) return false;

      // The signature is the customer's to give, so this transition is theirs
      // to make. `applyStatus` on the server stamps it as the delivery proof
      // and narrates the completion into the conversation.
      commit((current) => ({
        ...current,
        bookings: current.bookings.map((entry) =>
          entry.id === orderId ? { ...entry, status: 'Delivered' } : entry
        ),
      }));

      enqueue({
        kind: 'order:status',
        id: orderId,
        patch: { status: 'delivered', signature, deliveryCode: code.trim() },
      });
      return true;
    },
    [commit, enqueue, mirror.bookings]
  );

  const reportIssue = useCallback<ClientState['reportIssue']>(
    (orderId, note, photoUri) => {
      sendMessage(orderId, photoUri ? `${note}\n\nPhoto attached: ${photoUri}` : note);

      // The photo is also attached to the job itself, so it sits beside the
      // rider's own proof shots rather than only in the chat log. The dispatch
      // route needs a status to attach to, and the only safe one to name is the
      // status the job is *already* in — naming any other would rewind or
      // fast-forward the rider's progress. Without live telemetry we don't know
      // it, so the photo stays in the conversation alone.
      const live = mirror.bookings.find((booking) => booking.id === orderId)?.rider?.jobStatus;
      if (photoUri && live && !isTerminal(live)) {
        enqueue({ kind: 'order:status', id: orderId, patch: { status: live, photo: photoUri } });
      }
    },
    [sendMessage, enqueue, mirror.bookings]
  );

  // ---------------------------------------------------------------- wallet

  const recordTransaction = useCallback<ClientState['recordTransaction']>(
    (transaction) => {
      commit((current) => ({
        ...current,
        transactions: [
          transaction,
          ...current.transactions.filter((t) => t.reference !== transaction.reference),
        ],
      }));
      enqueue({ kind: 'transaction:record', transaction });
    },
    [commit, enqueue]
  );

  const walletBalance = account?.walletBalance ?? 0;
  const points = account?.points ?? 0;

  /**
   * Files the row a wallet movement produced into the local statement.
   *
   * The server wrote it already — this only saves the wallet tab waiting out a
   * poll to show what just happened.
   */
  const mergeTransaction = useCallback(
    (transaction: PaymentTransaction | null) => {
      if (!transaction) return;
      commit((current) => ({
        ...current,
        transactions: [
          transaction,
          ...current.transactions.filter((t) => t.reference !== transaction.reference),
        ],
      }));
    },
    [commit]
  );

  /**
   * Money and points move on the server, in one transaction with their ledger
   * entry.
   *
   * This used to be local arithmetic followed by a queued `account:upsert`
   * carrying an absolute balance — which meant a membership renewal the server
   * had just debited was silently restored by the next write from this device,
   * and that the app and the website each awarded loyalty points by their own
   * rules. `/api/accounts/wallet` decides both now, and hands back the account
   * to apply.
   *
   * Nothing here is queued for offline replay, for the reason `subscribeToPlan`
   * is not: a balance applied late, from a number that was already stale when
   * it was computed, is worse than a movement that failed and was retried.
   */
  const topUpWallet = useCallback<ClientState['topUpWallet']>(
    async (amount, method) => {
      const bearer = tokenRef.current;
      if (!bearer) return;

      const result = await api.topUpWallet({ amount, method }, bearer);
      applyAccount(result.account);
      mergeTransaction(result.transaction);
    },
    [applyAccount, mergeTransaction]
  );

  const chargeWallet = useCallback<ClientState['chargeWallet']>(
    async (amount, description, bookingId) => {
      const bearer = tokenRef.current;
      if (!bearer) return false;

      try {
        // One point per whole cedi is awarded server-side, by the same rule the
        // website's portal now goes through — see `pointsForSpend` in core.
        const result = await api.chargeWallet(
          { amount, description, bookingId },
          bearer
        );
        applyAccount(result.account);
        mergeTransaction(result.transaction);
        return true;
      } catch {
        // Not enough in the wallet, or the server is unreachable. Either way
        // the charge did not happen and the caller offers another method.
        return false;
      }
    },
    [applyAccount, mergeTransaction]
  );

  /** Spends care points on a reward from the shared catalogue. */
  const redeemReward = useCallback<ClientState['redeemReward']>(
    async (rewardId) => {
      const bearer = tokenRef.current;
      if (!bearer) {
        return { ok: false, reason: 'signed-out', message: 'Sign in to redeem a reward.' };
      }

      try {
        const result = await api.redeemReward({ rewardId }, bearer);
        applyAccount(result.account);
        mergeTransaction(result.transaction);
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) {
          const body = error.body as { reason?: string; shortfall?: number } | undefined;
          return {
            ok: false,
            reason: body?.reason === 'insufficient-points' ? 'insufficient-points' : 'rejected',
            shortfall: body?.shortfall,
            message: error.message,
          };
        }
        return {
          ok: false,
          reason: 'offline',
          message: 'Could not reach FreshFold. Check your connection and try again.',
        };
      }
    },
    [applyAccount, mergeTransaction]
  );

  // ----------------------------------------------------------- membership

  const plan = account?.plan ?? null;

  const includedPickupsLeft = useMemo(() => {
    const definition = membershipPlan(plan?.planId);
    if (!plan || !definition) return 0;
    return Math.max(0, definition.includedPickups - (plan.pickupsUsed ?? 0));
  }, [plan]);

  const planEndsOn = plan?.cancelAtPeriodEnd ? plan.renewsOn : null;

  /**
   * Subscribing is a server call, not a local write.
   *
   * The old path charged the wallet from the app and then wrote the plan to
   * this device — which meant one payment produced two ledger entries, awarded
   * loyalty points for buying a membership, and left the entitlement somewhere
   * the server could not see. All of that moves behind `/api/accounts/plan`,
   * which does the debit, the ledger and the plan as one transaction and hands
   * back the account it produced.
   *
   * There is deliberately no offline queueing here: a membership taken now and
   * priced whenever the connection returns is a bill the customer did not agree
   * to. It fails, and they retry.
   */
  const subscribeToPlan = useCallback<ClientState['subscribeToPlan']>(
    async (planId) => {
      if (!token) {
        return { ok: false, reason: 'signed-out', message: 'Sign in to start a membership.' };
      }

      try {
        const result = await api.subscribeToPlan(planId, token);
        applyAccount(result.account);

        // The debit and its ledger row were written server-side; pull the
        // statement so the wallet tab shows them without waiting for a poll.
        const email = result.account.email;
        void api
          .listTransactions({ email })
          .then((transactions) => commit((current) => ({ ...current, transactions })))
          .catch(() => {});

        return { ok: true, charged: result.charged, credit: result.credit };
      } catch (error) {
        if (error instanceof ApiError) {
          const body = error.body as { reason?: string; shortfall?: number } | undefined;
          if (body?.reason === 'insufficient-funds') {
            return {
              ok: false,
              reason: 'insufficient-funds',
              shortfall: body.shortfall,
              message: error.message,
            };
          }
          return { ok: false, reason: 'rejected', message: error.message };
        }
        return {
          ok: false,
          reason: 'offline',
          message: 'Could not reach FreshFold. Check your connection and try again.',
        };
      }
    },
    [token, applyAccount, commit]
  );

  /**
   * Cancels at the end of the period already paid for.
   *
   * Nothing is refunded and nothing stops today — which is what the plans
   * screen has always promised, and what the old immediate delete contradicted.
   */
  const cancelPlan = useCallback<ClientState['cancelPlan']>(async () => {
    if (!token) return null;

    try {
      const result = await api.cancelPlan(token);
      applyAccount(result.account);
      return result.activeUntil;
    } catch {
      return null;
    }
  }, [token, applyAccount]);

  const resumePlan = useCallback<ClientState['resumePlan']>(async () => {
    if (!token) return false;

    try {
      const result = await api.resumePlan(token);
      applyAccount(result.account);
      return true;
    } catch {
      return false;
    }
  }, [token, applyAccount]);

  // -------------------------------------------------------------- addresses

  const saveAddress = useCallback<ClientState['saveAddress']>(
    (address) => {
      commit((current) => {
        const others = current.addresses.filter((candidate) => candidate.id !== address.id);
        // Exactly one default at a time.
        const normalised = address.isDefault
          ? others.map((candidate) => ({ ...candidate, isDefault: false }))
          : others;
        const next = [...normalised, address];
        return {
          ...current,
          addresses: next.some((candidate) => candidate.isDefault)
            ? next
            : next.map((candidate, index) => ({ ...candidate, isDefault: index === 0 })),
        };
      });
    },
    [commit]
  );

  const removeAddress = useCallback<ClientState['removeAddress']>(
    (id) => {
      commit((current) => {
        const next = current.addresses.filter((address) => address.id !== id);
        return {
          ...current,
          addresses:
            next.length > 0 && !next.some((address) => address.isDefault)
              ? next.map((address, index) => ({ ...address, isDefault: index === 0 }))
              : next,
        };
      });
    },
    [commit]
  );

  // -------------------------------------------------------------- selectors

  const activeBookings = useMemo(
    () =>
      mirror.bookings
        .filter((booking) => booking.status !== 'Delivered' && booking.status !== 'Cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mirror.bookings]
  );

  const pastBookings = useMemo(
    () =>
      mirror.bookings
        .filter((booking) => booking.status === 'Delivered' || booking.status === 'Cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [mirror.bookings]
  );

  /**
   * The booking the app leads with: the one furthest along that is still
   * running, because that is the one about to need the customer's attention.
   */
  const primaryBooking = useMemo(() => {
    if (activeBookings.length === 0) return null;
    return [...activeBookings].sort(
      (a, b) => bookingProgressPercent(b.status) - bookingProgressPercent(a.status)
    )[0];
  }, [activeBookings]);

  const unreadCount = useMemo(
    () => mirror.notifications.filter((notification) => !notification.read).length,
    [mirror.notifications]
  );

  const defaultAddress = useMemo(
    () => mirror.addresses.find((address) => address.isDefault) ?? mirror.addresses[0] ?? null,
    [mirror.addresses]
  );

  const bookingById = useCallback(
    (id: string) => mirror.bookings.find((booking) => booking.id === id),
    [mirror.bookings]
  );

  /**
   * Pulls one order's proof-of-service into the mirror.
   *
   * Failure is silent on purpose: this runs when an order screen opens, often
   * on a phone that has just gone through a tunnel, and the screen it serves
   * renders perfectly well without the photographs. The next call gets them.
   */
  const loadBookingProof = useCallback(async (id: string) => {
    try {
      const full = await api.getBooking(id);
      commit((current) => ({
        ...current,
        bookings: current.bookings.map((booking) =>
          booking.id === id ? bookingWithKnownProof(booking, full) : booking
        ),
      }));
    } catch {
      // Offline, or the order is gone. The poll will say which.
    }
  }, []);

  const messagesFor = useCallback(
    (orderId: string) => mirror.messages.filter((message) => message.orderId === orderId),
    [mirror.messages]
  );

  const refresh = useCallback(async () => {
    await drain();
    await pull();
  }, [drain, pull]);

  const value = useMemo<ClientState>(
    () => ({
      ...mirror,
      hydrated,
      online,
      activeBookings,
      pastBookings,
      primaryBooking,
      unreadCount,
      walletBalance,
      points,
      plan,
      includedPickupsLeft,
      planEndsOn,
      createBooking,
      patchBooking,
      cancelBooking,
      bookingById,
      loadBookingProof,
      messagesFor,
      sendMessage,
      markNotificationRead,
      markAllNotificationsRead,
      verifyBags,
      confirmDelivery,
      reportIssue,
      topUpWallet,
      chargeWallet,
      redeemReward,
      recordTransaction,
      subscribeToPlan,
      cancelPlan,
      resumePlan,
      saveAddress,
      removeAddress,
      defaultAddress,
      refresh,
    }),
    [
      mirror,
      hydrated,
      online,
      activeBookings,
      pastBookings,
      primaryBooking,
      unreadCount,
      walletBalance,
      points,
      plan,
      includedPickupsLeft,
      planEndsOn,
      createBooking,
      patchBooking,
      cancelBooking,
      bookingById,
      loadBookingProof,
      messagesFor,
      sendMessage,
      markNotificationRead,
      markAllNotificationsRead,
      verifyBags,
      confirmDelivery,
      reportIssue,
      topUpWallet,
      chargeWallet,
      redeemReward,
      recordTransaction,
      subscribeToPlan,
      cancelPlan,
      resumePlan,
      saveAddress,
      removeAddress,
      defaultAddress,
      refresh,
    ]
  );

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient(): ClientState {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used inside <ClientProvider>');
  return ctx;
}
