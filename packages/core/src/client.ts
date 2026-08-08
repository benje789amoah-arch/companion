/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AuthSession,
  Booking,
  JobStatus,
  LaundryBag,
  Message,
  Notification,
  Order,
  RiderState,
  RiderTelemetry,
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

  return {
    baseUrl: root,

    /** Cheap reachability probe — both apps use it to decide online/offline. */
    health: () => request<{ ok: true; jobs: number; version: string }>('/health'),

    // -- Bookings: the customer's view ------------------------------------
    listBookings: (params?: { email?: string }) =>
      request<Booking[]>('/bookings', { query: { email: params?.email } }),

    getBooking: (id: string) => request<Booking>(`/bookings/${encodeURIComponent(id)}`),

    createBooking: (booking: Booking) => request<Booking>('/bookings', json('POST', booking)),

    updateBooking: (id: string, patch: Partial<Booking>) =>
      request<Booking>(`/bookings/${encodeURIComponent(id)}`, json('PATCH', patch)),

    deleteBooking: (id: string) =>
      request<{ ok: true }>(`/bookings/${encodeURIComponent(id)}`, json('DELETE')),

    // -- Orders: the rider's view -----------------------------------------
    listOrders: (params?: { riderId?: string }) =>
      request<Order[]>('/orders', { query: { riderId: params?.riderId } }),

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

    // -- Riders ------------------------------------------------------------
    listRiders: () => request<RiderState[]>('/riders'),

    getRider: (id: string) => request<RiderState>(`/riders/${encodeURIComponent(id)}`),

    updateRider: (id: string, telemetry: RiderTelemetry) =>
      request<RiderState>(`/riders/${encodeURIComponent(id)}`, json('PATCH', telemetry)),

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
