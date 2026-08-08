/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { guard } from '../helpers';

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

paystackRouter.get(
  '/verify/:reference',
  guard(async (req, res) => {
    const { reference } = req.params;
    if (!reference) {
      res.status(400).json({ error: 'Transaction reference is required.' });
      return;
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is not configured on the server.' });
      return;
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${secret.trim()}` } }
    );

    const data = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: Record<string, unknown>;
    };

    if (!response.ok || !data.status) {
      res.status(400).json({ error: data.message || 'Paystack verification failed.', details: data });
      return;
    }

    res.json({ status: true, data: data.data });
  })
);
