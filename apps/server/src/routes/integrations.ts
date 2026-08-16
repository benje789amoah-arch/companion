/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { guard } from '../helpers';
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

chatRouter.post(
  '/',
  guard(async (req, res) => {
    const { history } = req.body as { history?: { role: string; content: string }[] };
    if (!history || !Array.isArray(history)) {
      res.status(400).json({ error: 'Invalid history format. Must be an array of messages.' });
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

paystackRouter.post(
  '/initialize',
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
    });

    const data = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!response.ok || !data.status || !data.data) {
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

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.trim())}`,
    { method: 'GET', headers: { Authorization: `Bearer ${secret.trim()}` } }
  );

  const body = (await response.json()) as {
    status?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };

  if (!response.ok || !body.status || !body.data) {
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

paystackRouter.get(
  '/verify/:reference',
  guard(async (req, res) => {
    const result = await verifyPaystackTransaction(req.params.reference);

    if (!result.ok) {
      res.status(result.status).json({ error: result.error, details: result.details });
      return;
    }

    res.json({ status: true, data: result.verification.raw });
  })
);
