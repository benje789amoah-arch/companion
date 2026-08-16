/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActivePlan } from './membership';
import type { RouteLeg } from './route';
import type {
  AdminSession,
  AuthSession,
  Booking,
  Coords,
  JobStatus,
  LaundryBag,
  Message,
  Notification,
  Order,
  PaymentTransaction,
  RiderSession,
  RiderState,
  RiderTelemetry,
  SupervisorProfile,
  UserAccount,
} from './types';

/**
 * The one HTTP client both apps use.
 *
 * Written against bare `fetch` with no platform imports so the same file runs
 * under Vite, Metro and Node. Every method returns a plain promise and throws
 * an {@link ApiError} on a non-2xx response; callers decide whether that means
 * "show an error" or "fall back to the local cache".
 */

export const API_PREFIX = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientOptions {
  /** Origin of the dispatch server, e.g. `http://192.168.1.42:4000`. */
  baseUrl: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Abort a request after this long. Defaults to 8s. */
  timeoutMs?: number;
}

export interface PaystackInitResult {
  status: boolean;
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function createClient(options: ClientOptions) {
  const { baseUrl, fetchImpl, timeoutMs = 8000 } = options;
  const root = baseUrl.replace(/\/$/, '');
  const doFetch: typeof fetch = fetchImpl ?? ((...args) => fetch(...args));

  async function request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string | undefined> } = {}
  ): Promise<T> {
    const { query, ...rest } = init;

    let url = `${root}${API_PREFIX}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') params.set(key, value);
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(url, {
        ...rest,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(rest.headers ?? {}),
        },
      });

      const text = await response.text();
      const body = text ? safeJson(text) : undefined;

      if (!response.ok) {
        const message =
          (body && typeof body === 'object' && 'error' in body
            ? String((body as { error: unknown }).error)
            : null) ?? `${rest.method ?? 'GET'} ${path} failed (${response.status})`;
        throw new ApiError(message, response.status, body);
      }

      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  const json = (method: string, payload?: unknown) => ({
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  return {
    baseUrl: root,

    /** Cheap reachability probe — both apps use it to decide online/offline. */
    health: () => request<{ ok: true; jobs: number; version: string }>('/health'),

    // -- Bookings: the customer's view ------------------------------------
    //
    // The list is a summary: it carries everything a board or a history screen
    // draws, but not the proof-of-service photographs, which are megabytes that
    // no list renders. `getBooking` is the full record, and is what a surface
    // calls when it is about to show the proof for one order.
    listBookings: (params?: { email?: string }) =>
      request<Booking[]>('/bookings', { query: { email: params?.email } }),

    getBooking: (id: string) => request<Booking>(`/bookings/${encodeURIComponent(id)}`),

    /**
     * Books a job.
     *
     * The token is optional because a visitor can book — but a signed-in
     * customer should send it, because that is how the server knows whether
     * this booking is under a membership. `planId` in the body is ignored:
     * dispatch priority is decided from the account, not from the request.
     */
    createBooking: (booking: Booking, token?: string | null) =>
      request<Booking>('/bookings', {
        ...json('POST', booking),
        headers: token ? bearer(token) : undefined,
      }),

    updateBooking: (id: string, patch: Partial<Booking>) =>
      request<Booking>(`/bookings/${encodeURIComponent(id)}`, json('PATCH', patch)),

    deleteBooking: (id: string) =>
      request<{ ok: true }>(`/bookings/${encodeURIComponent(id)}`, json('DELETE')),

    // -- Orders: the rider's view -----------------------------------------
    listOrders: (params?: { riderId?: string }) =>
      request<Order[]>('/orders', { query: { riderId: params?.riderId } }),

    /** One order with its proof photographs, which the list leaves behind. */
    getOrder: (id: string) => request<Order>(`/orders/${encodeURIComponent(id)}`),

    createOrder: (order: Order) => request<Order>('/orders', json('POST', order)),

    acceptOrder: (id: string, riderId: string) =>
      request<Order>(`/orders/${encodeURIComponent(id)}/accept`, json('POST', { riderId })),

    declineOrder: (id: string, riderId: string) =>
      request<Order>(`/orders/${encodeURIComponent(id)}/decline`, json('POST', { riderId })),

    updateOrderStatus: (
      id: string,
      patch: {
        status: JobStatus;
        riderId?: string;
        photo?: string;
        signature?: string;
        bags?: LaundryBag[];
        /**
         * The four digits the customer read out at the door. Required to
         * complete a delivery — the server checks it, and rejects the
         * transition without either this or `overrideReason`.
         */
        deliveryCode?: string;
        /**
         * The four digits on the hub desk's screen. Required to check a load
         * in — the server checks it, and rejects `dropped_off` without either
         * this or `overrideReason`.
         */
        dropoffCode?: string;
        /**
         * Why a hand-off completed without the other party's code. Applies to
         * whichever leg the `status` names.
         */
        overrideReason?: string;
      }
    ) => request<Order>(`/orders/${encodeURIComponent(id)}/status`, json('PATCH', patch)),

    // -- Auth --------------------------------------------------------------
    //
    // The password is sent here and compared here. It is never stored in, or
    // returned to, the browser.

    register: (payload: {
      email: string;
      phone: string;
      name: string;
      password: string;
    }) => request<AuthSession>('/auth/register', json('POST', payload)),

    /** `identifier` is an email address or a phone number. */
    login: (payload: { identifier: string; password: string }) =>
      request<AuthSession>('/auth/login', json('POST', payload)),

    /**
     * Sends another email-confirmation link to the signed-in account.
     *
     * Throws a 429 with a human message when pressed twice in quick succession,
     * and a 409 once the address is already confirmed — both worth showing the
     * customer verbatim rather than mapping to a generic failure.
     */
    resendVerification: (token: string) =>
      request<{ ok: true }>('/auth/resend-verification', {
        method: 'POST',
        headers: bearer(token),
      }),

    /**
     * Asks for a password-reset link.
     *
     * `identifier` is an email address or a phone number — whichever the
     * customer remembers. Always resolves `{ ok: true }` when the request was
     * well-formed, whether or not an account exists and whether or not the mail
     * went out: the server will not confirm who banks here, so there is nothing
     * for a caller to branch on. The UI says "if that address has an account,
     * a link is on its way" and means it.
     */
    requestPasswordReset: (identifier: string) =>
      request<{ ok: true }>('/auth/forgot', json('POST', { identifier })),

    /**
     * Spends a reset link and sets the new password.
     *
     * The emailed page calls this itself, so the apps do not have to — it is
     * here for a surface that wants to collect the password in-app instead.
     * Every existing session for the account is revoked on success, including
     * the caller's own.
     */
    resetPassword: (payload: { token: string; password: string }) =>
      request<{ ok: true }>('/auth/reset', json('POST', payload)),

    /**
     * The booking behind an emailed setup link.
     *
     * `token` is the one in the link and nothing else identifies the order, so
     * a 400 here means the link is spent, expired or never existed — the server
     * does not say which.
     */
    setupLinkBooking: (token: string) =>
      request<{ booking: { id: string; name: string; email: string; phone: string } }>(
        '/auth/claim',
        { query: { token } }
      ),

    /**
     * Spends a setup link: sets the first password on the booking's account and
     * returns a session for it.
     *
     * The counterpart to `register` for somebody who booked as a guest. Which
     * account it opens is decided by the token, never by the caller — there is
     * deliberately no email or phone in this payload.
     */
    claimBooking: (payload: { token: string; password: string }) =>
      request<AuthSession>('/auth/claim', json('POST', payload)),

    /**
     * Asks for the setup link to be sent again.
     *
     * For a customer who booked as a guest and lost the confirmation email —
     * `requestPasswordReset` cannot help them, because there is no account to
     * reset. Always resolves `{ ok: true }` for a well-formed request, whatever
     * the server found: it will not confirm who has booked with FreshFold.
     */
    requestSetupLink: (identifier: string) =>
      request<{ ok: true }>('/auth/resend-setup', json('POST', { identifier })),

    /** Does this contact already have a login? Returns booleans only. */
    authStatus: (identifier: string) =>
      request<{ exists: boolean; hasPassword: boolean }>('/auth/status', json('POST', { identifier })),

    logout: (token: string) =>
      request<{ ok: true }>('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }),

    /** Re-validates a stored token on load; throws 401 once it has expired. */
    me: (token: string) =>
      request<UserAccount>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),

    // -- Supervisor desk ---------------------------------------------------
    //
    // Supervisors are provisioned, so there is no register call. This session
    // is what the roster-management endpoints require.

    adminLogin: (payload: { email: string; password: string }) =>
      request<AdminSession>('/admin/login', json('POST', payload)),

    adminMe: (token: string) =>
      request<SupervisorProfile>('/admin/me', { headers: bearer(token) }),

    adminLogout: (token: string) =>
      request<{ ok: true }>('/admin/logout', { method: 'POST', headers: bearer(token) }),

    // -- Riders ------------------------------------------------------------
    //
    // Couriers are provisioned, never self-registered, so there is no register
    // call here. Everything below the login needs the token it returns: the
    // roster is staff data, and a position update is a claim about where a
    // named person is.

    /** `identifier` is an employee ID or the courier's phone number. */
    riderLogin: (payload: { identifier: string; pin: string }) =>
      request<RiderSession>('/riders/login', json('POST', payload)),

    /** Re-validates a stored token on launch; throws 401 once it has expired. */
    riderMe: (token: string) =>
      request<RiderState>('/riders/me', { headers: bearer(token) }),

    riderLogout: (token: string) =>
      request<{ ok: true }>('/riders/logout', { method: 'POST', headers: bearer(token) }),

    /**
     * Puts a courier on the roster. Supervisor only.
     *
     * The employee ID is assigned by the server and read off the returned
     * rider. The temporary PIN comes back exactly once, in this response — it
     * is hashed on the way in and cannot be read again. Losing it means issuing
     * another.
     */
    createRider: (
      payload: { name?: string; phone: string; vehicle: string; vehiclePlate: string },
      token: string
    ) =>
      request<{ rider: RiderState; temporaryPin: string; pinExpiresAt: string }>(
        '/riders',
        { ...json('POST', payload), headers: bearer(token) }
      ),

    /**
     * Reassigns the vehicle a courier rides. Supervisor only.
     *
     * Vehicles move between couriers — a scooter goes in for repair and its
     * rider takes another — so this exists as well as the field on creation.
     * The courier's own app cannot write either value.
     */
    setRiderVehicle: (
      id: string,
      payload: { vehicle: string; vehiclePlate: string },
      token: string
    ) =>
      request<RiderState>(`/riders/${encodeURIComponent(id)}/vehicle`, {
        ...json('PATCH', payload),
        headers: bearer(token),
      }),

    /** Takes a courier off the roster, or puts them back. Supervisor only. */
    setRiderActive: (id: string, active: boolean, token: string) =>
      request<RiderState>(`/riders/${encodeURIComponent(id)}/active`, {
        ...json('PATCH', { active }),
        headers: bearer(token),
      }),

    /** Replaces a temporary PIN with one only the courier knows. */
    changeRiderPin: (payload: { currentPin: string; newPin: string }, token: string) =>
      request<{ ok: true }>('/riders/change-pin', {
        ...json('POST', payload),
        headers: bearer(token),
      }),

    /**
     * The road route between two points, as the courier would ride it.
     *
     * Computed by the dispatch server so the routing key stays out of every
     * client bundle and one answer is shared by all three apps. Falls back to
     * a straight line — flagged as such in `source` — when routing is
     * unavailable, so callers never have to handle an error to draw a map.
     */
    getDirections: (from: Coords, to: Coords) =>
      request<RouteLeg>(
        `/directions?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`
      ),

    listRiders: (token: string) => request<RiderState[]>('/riders', { headers: bearer(token) }),

    getRider: (id: string, token: string) =>
      request<RiderState>(`/riders/${encodeURIComponent(id)}`, { headers: bearer(token) }),

    updateRider: (id: string, telemetry: RiderTelemetry, token: string) =>
      request<RiderState>(`/riders/${encodeURIComponent(id)}`, {
        ...json('PATCH', telemetry),
        headers: bearer(token),
      }),

    // -- Messaging ---------------------------------------------------------
    listMessages: (params?: { orderId?: string }) =>
      request<Message[]>('/messages', { query: { orderId: params?.orderId } }),

    postMessage: (message: Omit<Message, 'id' | 'timestamp'> & Partial<Message>) =>
      request<Message>('/messages', json('POST', message)),

    listNotifications: (params?: { riderId?: string }) =>
      request<Notification[]>('/notifications', { query: { riderId: params?.riderId } }),

    postNotification: (notification: Omit<Notification, 'id' | 'timestamp'> & Partial<Notification>) =>
      request<Notification>('/notifications', json('POST', notification)),

    markNotificationRead: (id: string) =>
      request<Notification>(`/notifications/${encodeURIComponent(id)}/read`, json('POST')),

    // -- Accounts ----------------------------------------------------------
    //
    // Profile data only. Credentials are not readable or writable here; see
    // the auth routes above.

    listAccounts: () => request<UserAccount[]>('/accounts'),

    upsertAccount: (account: UserAccount) =>
      request<UserAccount>('/accounts', json('PUT', account)),

    /**
     * Suspends a customer, or lifts the suspension. Supervisor only.
     *
     * The reason is for the desk's record and comes back on this response; it
     * is not published on the account list, and the customer is never shown it.
     */
    setAccountBlocked: (
      email: string,
      payload: { blocked: boolean; reason?: string },
      token: string
    ) =>
      request<UserAccount>(`/accounts/${encodeURIComponent(email)}/blocked`, {
        ...json('PATCH', payload),
        headers: bearer(token),
      }),

    /**
     * Erases a customer account. Supervisor only, and refused while they still
     * have a job on the board — blocking is what stops somebody mid-flight.
     *
     * Their past orders stay in the ledger: a job carries its own copy of the
     * customer's details and is not joined back to the account.
     */
    deleteAccount: (email: string, token: string) =>
      request<{ ok: true }>(`/accounts/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: bearer(token),
      }),

    // -- Membership --------------------------------------------------------
    //
    // A plan is a paid entitlement, so every call here carries the customer's
    // token and the server decides what the plan costs and when it ends. The
    // app cannot write a membership any other way — `upsertAccount` above will
    // not accept one.

    /** The membership as the server has it, with any due renewal settled. */
    getPlan: (token: string) =>
      request<{ plan: ActivePlan | null; account: UserAccount | null }>('/accounts/plan', {
        headers: bearer(token),
      }),

    /**
     * Starts a plan, or switches to one.
     *
     * The wallet is debited by the server for the prorated amount, and the
     * ledger entry is written in the same transaction — which is why there is
     * no separate `chargeWallet` call on this path. A switch returns the
     * `credit` applied from the plan being replaced.
     *
     * Throws `ApiError` 409 with `{ reason: 'insufficient-funds', shortfall }`
     * when the wallet cannot cover it.
     */
    subscribeToPlan: (planId: string, token: string) =>
      request<{ account: UserAccount; plan: ActivePlan; charged: number; credit: number }>(
        '/accounts/plan',
        { ...json('POST', { planId }), headers: bearer(token) }
      ),

    /** Ends the plan when the paid period runs out — never mid-period. */
    cancelPlan: (token: string) =>
      request<{ account: UserAccount; plan: ActivePlan | null; activeUntil: string }>(
        '/accounts/plan',
        { method: 'DELETE', headers: bearer(token) }
      ),

    /** Undoes a pending cancellation while the period is still running. */
    resumePlan: (token: string) =>
      request<{ account: UserAccount; plan: ActivePlan | null; activeUntil: string }>(
        '/accounts/plan',
        { method: 'DELETE', headers: bearer(token), query: { resume: 'true' } }
      ),

    // -- Payment ledger ----------------------------------------------------
    //
    // Scoped by email so a customer app can ask for one person's statement
    // rather than pulling the whole ledger down to filter it on the device.

    listTransactions: (params?: { email?: string }) =>
      request<PaymentTransaction[]>('/transactions', { query: { email: params?.email } }),

    /** Upserts by `reference`, so replaying a queued write is safe. */
    recordTransaction: (transaction: PaymentTransaction) =>
      request<PaymentTransaction>('/transactions', json('POST', transaction)),

    // -- Integrations ------------------------------------------------------
    chat: (history: ChatMessage[]) =>
      request<{ reply: string }>('/chat', json('POST', { history })),

    initializePayment: (payload: {
      email: string;
      amount: number;
      metadata?: Record<string, unknown>;
      callback_url?: string;
    }) => request<PaystackInitResult>('/paystack/initialize', json('POST', payload)),

    verifyPayment: (reference: string) =>
      request<{ status: boolean; data: Record<string, unknown> }>(
        `/paystack/verify/${encodeURIComponent(reference)}`
      ),
  };
}

export type FreshFoldClient = ReturnType<typeof createClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
