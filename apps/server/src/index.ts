/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { store } from './store';
import { authRouter } from './routes/auth';
import { bookingsRouter } from './routes/bookings';
import { ordersRouter } from './routes/orders';
import { ridersRouter } from './routes/riders';
import { messagesRouter, notificationsRouter } from './routes/messaging';
import { accountsRouter, transactionsRouter } from './routes/accounts';
import { chatRouter, paystackRouter } from './routes/integrations';

/**
 * The FreshFold dispatch server.
 *
 * One process owns the data both products depend on. The website talks to it
 * through Vite's dev proxy; the rider app talks to it over the LAN. Neither
 * app writes anything the other cannot see.
 */

dotenv.config();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

const app = express();

// Bodies carry base64 proof-of-service photos and signature PNGs, which blow
// past Express's 100kb default.
app.use(express.json({ limit: '12mb' }));

/**
 * CORS.
 *
 * The rider app runs on a phone against this machine's LAN address, so it is
 * always cross-origin and development needs to be permissive. Production does
 * not: set `CORS_ORIGINS` to a comma-separated allow-list. Leaving it unset in
 * production is a misconfiguration worth shouting about rather than silently
 * serving every origin on the internet.
 */
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn(
    '[cors] CORS_ORIGINS is not set. Refusing cross-origin requests. ' +
      'Set it to the origins your apps are served from, e.g. https://freshfold.example,http://192.168.1.42:8081'
  );
}

app.use(
  cors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : process.env.NODE_ENV === 'production'
          ? false
          : true,
  })
);

app.get('/api/health', (_req, res) => {
  const db = store.read();
  res.json({
    ok: true,
    jobs: db.jobs.length,
    riders: db.riders.length,
    version: '1.0.0',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/riders', ridersRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/paystack', paystackRouter);

/** The canonical records, for debugging and for the admin dashboard. */
app.get('/api/jobs', (_req, res) => {
  res.json(store.read().jobs);
});

app.post('/api/reset', (_req, res) => {
  store.reset();
  res.json({ ok: true });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown API route' });
});

// In production this process also serves the built website. In development
// Vite serves it on its own port and proxies /api back here.
if (process.env.NODE_ENV === 'production') {
  const distPath = process.env.WEB_DIST
    ? path.resolve(process.env.WEB_DIST)
    : path.resolve(HERE, '..', '..', 'web', 'dist');

  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`FreshFold dispatch server listening on http://0.0.0.0:${PORT}`);
  console.log(`  data: ${store.file}`);
  console.log(`  point the rider app at this machine's LAN address on port ${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    store.flush();
    server.close(() => process.exit(0));
  });
}
