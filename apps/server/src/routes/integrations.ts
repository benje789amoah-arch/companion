/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { guard } from '../helpers';
import { rateLimit } from '../rateLimit';
import { topUp } from '../wallet';

/**
 * Third-party integrations, carried over unchanged from the original web
 * server: the Gemini-backed concierge chatbot and Paystack payment
 * initialize/verify. Both keep their secrets server-side, which is why they
 * live here and not in the browser bundle.
 */

export const chatRouter = Router();

const SYSTEM_INSTRUCTION = `You are "Foldie", the exclusive virtual laundry concierge and brand ambassador for FreshFold Laundry Co.
FreshFold Laundry Co. is an ultra-premium, high-end laundry and garment care concierge service operating around KNUST Campus and surrounding suburbs (Bomso, Ayeduase, Kotei, Deduako, Boadi).

Your persona and guidelines:
- Tone: Extremely professional, warm, polished, polite, and helpful, like an elite luxury hotel concierge.
- Knowledge base:
  - We specialize in standard laundry, premium steam-pressing, gentle dry cleaning, sneaker restoration, couture/delicate care, and tailored scent matching (options include "Lavender Fields", "Alpine Fresh", "Sandalwood Silk", or "Unscented").
  - Suburbs we service: Bomso, Ayeduase, KNUST Campus, Kotei, Deduako, Boadi.
  - Features: We have a secure client portal where users can login with their credentials (email/phone and password) to schedule pickups, track their order history, view a live telemetry dispatch map of active courier riders, and rate riders to earn care loyalty points.
  - Riders carry the FreshFold Dispatch companion app, so pickup and delivery progress the customer sees is reported live from the courier's own device.
  - Scheduling: To schedule a pickup, users can use our prominent "Schedule Garment Concierge Pickup" form, which pre-fills their details if they are logged into the Client Portal.
- Keep responses concise, elegant, and nicely formatted (use bullet points or simple paragraphs, but avoid overly long or verbose essays unless asked).
- Answer questions accurately using this context. Encourage them to use the client portal or schedule a pickup!`;

/**
 * The concierge's ceiling.
 *
 * Open by necessity, like the directions and places proxies: the chat bubble sits
 * on the marketing page in front of visitors who have no account, and requiring
 * one would be requiring an account to ask a question. Unlike those two it had no
 * limit at all — so it was an unmetered generation endpoint on our key, taking
 * arbitrary prompts from anybody who found it.
 *
 * Twelve a minute is a conversation. It is not a way to spend the month's quota
 * on somebody else's workload.
 */
const chatLimit = rateLimit({
  max: 12,
  windowMs: 60 * 1000,
  message: 'You are asking rather quickly. Give the concierge a moment.',
});

/**
 * Longest exchange worth forwarding.
 *
 * The whole conversation is re-sent on every turn, and the caller composes it, so
 * without a bound a single request can carry as many tokens as it likes.
 */
const MAX_HISTORY_TURNS = 40;
const MAX_MESSAGE_CHARS = 4000;

chatRouter.post(
  '/',
  chatLimit,
  guard(async (req, res) => {
    const { history } = req.body as { history?: { role: string; content: string }[] };
    if (!history || !Array.isArray(history)) {
      res.status(400).json({ error: 'Invalid history format. Must be an array of messages.' });
      return;
    }

    if (history.length > MAX_HISTORY_TURNS) {
      res.status(413).json({ error: 'That conversation is too long. Start a new one.' });
      return;
    }

    if (history.some((message) => (message?.content?.length ?? 0) > MAX_MESSAGE_CHARS)) {
      res.status(413).json({ error: 'That message is too long for the concierge.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY is not set on the dispatch server. Add it to apps/server/.env to enable the concierge chatbot.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'freshfold-dispatch' } },
    });

    const contents = history.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 },
    });

    res.json({
      reply: response.text || 'I apologize, but I am unable to process that request right now.',
    });
  })
);

export const paystackRouter = Router();

/**
 * How long either Paystack call gets before we stop waiting on it.
 *
 * Node's `fetch` has no total-request deadline of its own, so without this a
 * Paystack that accepts the connection and then says nothing holds the handler
 * open indefinitely — well past the 8 seconds both apps' API clients abort at.
 * The customer then reads their own client's timeout as the gateway being slow,
 * while this side has no record of anything having gone wrong at all.
 *
 * Under that 8s budget deliberately, and by enough to answer: the caller has to
 * *receive* the 504 below, which it cannot do if we are still waiting when it
 * gives up.
 */
const PAYSTACK_TIMEOUT_MS = 6000;

/** The rejection `AbortSignal.timeout` raises when its deadline passes. */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** The envelope both Paystack endpoints answer in. `data` differs per call. */
interface PaystackBody<T> {
  status?: boolean;
  message?: string;
  data?: T;
}

/**
 * Opens a checkout.
 *
 * Left open, because the customer paying for a booking on the website may well
 * not have an account yet — that is the funnel. What it can do in the wrong hands
 * is bounded: it creates a payment *intent* on the merchant account and returns a
 * URL, so the cost of abuse is noise in the Paystack dashboard and quota, not
 * money moving. Nothing is credited anywhere until `/accounts/wallet` re-verifies
 * the reference and matches the payer against a session.
 *
 * The window is what stops it being an unbounded way to manufacture that noise.
 */
paystackRouter.post(
  '/initialize',
  rateLimit({
    max: 10,
    windowMs: 60 * 1000,
    message: 'Too many payment attempts. Try again in a minute.',
  }),
  guard(async (req, res) => {
    const { email, amount, metadata, callback_url } = req.body as {
      email?: string;
      amount?: number;
      metadata?: Record<string, unknown>;
      callback_url?: string;
    };

    if (!email || !amount) {
      res.status(400).json({ error: 'Email and amount (in GHS) are required.' });
      return;
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      res.status(500).json({
        error:
          'PAYSTACK_SECRET_KEY is not set on the dispatch server. Add it to apps/server/.env to enable online payments.',
      });
      return;
    }

    // The whole exchange is inside the try, not just the headers: the deadline
    // runs from the moment the signal is made, so it can also fire part-way
    // through reading the body, and that rejects here rather than at `fetch`.
    let ok: boolean;
    let data: PaystackBody<{ authorization_url: string; access_code: string; reference: string }>;

    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          // Paystack bills in the minor unit: 1 GHS = 100 pesewas.
          amount: Math.round(Number(amount) * 100),
          currency: 'GHS',
          metadata: metadata || {},
          callback_url:
            callback_url || (process.env.APP_URL ? `${process.env.APP_URL}#paystack-success` : undefined),
        }),
        signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
      });

      ok = response.ok;
      data = (await response.json()) as PaystackBody<{
        authorization_url: string;
        access_code: string;
        reference: string;
      }>;
    } catch (error) {
      if (!isTimeout(error)) throw error;

      // Nothing to reconcile, which is why this can simply say "try again": a
      // transaction Paystack may have created here is one whose URL nobody
      // received, and an intent nobody pays on never moves money.
      console.warn(`[paystack] initialize for ${email.trim()} timed out after ${PAYSTACK_TIMEOUT_MS}ms.`);
      res.status(504).json({
        error: 'Paystack did not answer in time. Nothing was charged — try again.',
        reason: 'gateway-timeout',
      });
      return;
    }

    if (!ok || !data.status || !data.data) {
      res.status(400).json({
        error: data.message || 'Failed to initialize Paystack transaction.',
        details: data,
      });
      return;
    }

    res.json({
      status: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
    });
  })
);

/**
 * What Paystack says about a reference, in the shape callers actually need.
 *
 * `amount` is converted back out of the minor unit here, once, so nothing
 * downstream has to remember that Paystack counts in pesewas. `email` is the
 * customer the transaction was created for — the wallet route matches it
 * against the session, so one customer cannot claim another's payment.
 */
export interface PaystackVerification {
  /** Paystack's own transaction status: `success`, `failed`, `abandoned`… */
  paid: boolean;
  status: string;
  /** Amount actually collected, in cedis. */
  amount: number;
  currency: string;
  email: string;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export type PaystackVerifyResult =
  | { ok: true; verification: PaystackVerification }
  | { ok: false; status: number; error: string; details?: unknown };

/**
 * Asks Paystack whether a reference was paid.
 *
 * Shared by the verify route below and by the wallet top-up, which must not
 * take the client's word for it: the balance is credited from `amount` here,
 * never from the amount in the request body.
 */
export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackVerifyResult> {
  if (!reference?.trim()) {
    return { ok: false, status: 400, error: 'Transaction reference is required.' };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error:
        'PAYSTACK_SECRET_KEY is not set on the dispatch server. Add it to apps/server/.env to enable online payments.',
    };
  }

  // Headers and body both inside the try — see the note on the initialize call.
  let ok: boolean;
  let body: PaystackBody<Record<string, unknown>>;

  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.trim())}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${secret.trim()}` },
        signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
      }
    );

    ok = response.ok;
    body = (await response.json()) as PaystackBody<Record<string, unknown>>;
  } catch (error) {
    if (!isTimeout(error)) throw error;

    // Retryable, and says so: the caller's payment may well have settled, and
    // the only thing that has failed is our asking about it. Both settlement
    // paths key on this reference and `topUp` ignores one already in the
    // ledger, so trying again — or the webhook arriving first — credits once.
    console.warn(`[paystack] verify of ${reference.trim()} timed out after ${PAYSTACK_TIMEOUT_MS}ms.`);
    return {
      ok: false,
      status: 504,
      error:
        'Paystack did not answer in time, so this payment could not be confirmed. If you were charged, the money is safe — try again in a moment.',
    };
  }

  if (!ok || !body.status || !body.data) {
    return {
      ok: false,
      status: 400,
      error: body.message || 'Paystack verification failed.',
      details: body,
    };
  }

  const data = body.data;
  const status = typeof data.status === 'string' ? data.status : 'unknown';
  const customer = (data.customer ?? {}) as { email?: unknown };

  return {
    ok: true,
    verification: {
      paid: status === 'success',
      status,
      amount: typeof data.amount === 'number' ? data.amount / 100 : 0,
      currency: typeof data.currency === 'string' ? data.currency : 'GHS',
      email: typeof customer.email === 'string' ? customer.email : '',
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
      raw: data,
    },
  };
}

/**
 * Constant-time compare of two hex digests.
 *
 * `timingSafeEqual` throws on a length mismatch rather than returning false,
 * and a forged header is exactly where a length mismatch comes from.
 */
function signatureMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Paystack's own notification that a payment settled.
 *
 * The reason this exists: until now a top-up was only credited when the
 * customer came back and tapped "I have paid". Someone who paid and then
 * closed the app, lost signal, or had their battery die had money with
 * Paystack and nothing in their wallet until they thought to return. This
 * arrives whether or not anyone is holding the phone.
 *
 * It does not replace the verify-on-return path, it races it. Both call
 * `topUp` with Paystack's reference, and `topUp` ignores a reference already
 * in the ledger — so whichever gets there first credits, and the other is a
 * no-op. That is also what makes Paystack's own retries harmless.
 *
 * The body is the raw bytes, not parsed JSON: the signature is over exactly
 * what was sent, and `JSON.parse` followed by `JSON.stringify` is not
 * guaranteed to reproduce it. See the `express.raw` mount in `index.ts`.
 */
paystackRouter.post(
  '/webhook',
  guard(async (req, res) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      // 500, not 200: this is our misconfiguration, and Paystack retrying is
      // the behaviour we want once the key is in place.
      console.error('[paystack] webhook received but PAYSTACK_SECRET_KEY is not set.');
      res.status(500).json({ error: 'Webhook not configured.' });
      return;
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.get('x-paystack-signature') ?? '';
    const expected = createHmac('sha512', secret.trim()).update(raw).digest('hex');

    if (!signature || !signatureMatches(expected, signature)) {
      // Anyone can POST here; only Paystack can sign. Refuse quietly — an
      // unsigned caller learns nothing about what a signed one would get.
      res.status(401).json({ error: 'Invalid signature.' });
      return;
    }

    let event: { event?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'Malformed webhook body.' });
      return;
    }

    // Everything below is acknowledged with 200 whether or not it moves money.
    // A non-2xx makes Paystack retry, and retrying will not fix an event this
    // server has no interest in.
    if (event.event !== 'charge.success' || !event.data) {
      res.json({ received: true, applied: false, reason: 'event-ignored' });
      return;
    }

    const data = event.data;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const customer = (data.customer ?? {}) as { email?: unknown };
    const reference = typeof data.reference === 'string' ? data.reference : '';
    const email = typeof customer.email === 'string' ? customer.email : '';
    const amount = typeof data.amount === 'number' ? data.amount / 100 : 0;

    // A booking's payment is not a wallet credit. Same gate the wallet route
    // applies, for the same reason: without it, paying for a wash would also
    // put its value in the wallet.
    if (metadata.type !== 'wallet_topup') {
      res.json({ received: true, applied: false, reason: 'not-a-topup' });
      return;
    }

    if (!reference || !email || amount <= 0) {
      console.warn(`[paystack] charge.success for ${reference || 'no reference'} is unusable.`);
      res.json({ received: true, applied: false, reason: 'incomplete-event' });
      return;
    }

    const outcome = await topUp({ email, amount, method: 'Paystack', reference });

    if (!outcome.ok) {
      // Logged rather than retried. `no-account` is the realistic case — a
      // payment made against an email this server has never seen — and no
      // number of retries will conjure the account.
      console.error(`[paystack] could not credit ${email} for ${reference}: ${outcome.reason}`);
      res.json({ received: true, applied: false, reason: outcome.reason });
      return;
    }

    console.log(`[paystack] credited ${email} ₵${amount.toFixed(2)} from ${reference}.`);
    res.json({ received: true, applied: true });
  })
);

/**
 * What a reference was worth, in the four fields a caller actually reads.
 *
 * This used to answer with `verification.raw` — Paystack's entire transaction
 * object — to anybody who asked, with no session and no check that the reference
 * had anything to do with them. That payload carries the paying customer's email,
 * phone and name, the IP the payment was made from, and an `authorization` block
 * with the card's bank, BIN and last four digits.
 *
 * All three callers read `status` and `reference` and nothing else; the two that
 * settle money do it through `/accounts/wallet`, which re-verifies server-side and
 * matches the payer against the session. So the rest of that object was never
 * being used for anything — it was only being published.
 *
 * Still open, deliberately: a guest pays for a booking and has to be able to ask
 * whether it went through. A reference is Paystack's own opaque string rather
 * than something walkable, and what this now says about one is no more than
 * whoever is holding it already knows.
 */
paystackRouter.get(
  '/verify/:reference',
  rateLimit({
    max: 20,
    windowMs: 60 * 1000,
    message: 'Too many verification attempts. Try again in a minute.',
  }),
  guard(async (req, res) => {
    const result = await verifyPaystackTransaction(req.params.reference);

    if (!result.ok) {
      res.status(result.status).json({ error: result.error, details: result.details });
      return;
    }

    const { paid, status, amount, currency } = result.verification;

    res.json({
      status: true,
      data: { status, reference: req.params.reference.trim(), paid, amount, currency },
    });
  })
);
