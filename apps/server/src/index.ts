/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { closeDatabase, ping } from './db';
import { store } from './store';
import { ensureSeeded } from './seed';
import { startHubCycle } from './hub';
import { guard } from './helpers';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { bookingsRouter } from './routes/bookings';
import { directionsRouter } from './routes/directions';
import { ordersRouter } from './routes/orders';
import { ridersRouter } from './routes/riders';
import { messagesRouter, notificationsRouter } from './routes/messaging';
import { accountsRouter, transactionsRouter } from './routes/accounts';
import { chatRouter, paystackRouter } from './routes/integrations';

/**
 * The FreshFold dispatch server.
 *
 * One process owns the data all three products depend on. The website talks to
 * it through Vite's dev proxy; the rider and customer apps talk to it over the
 * LAN. None of them writes anything the others cannot see.
 *
 * The records themselves live in Supabase Postgres — see `./db` for the
 * connection and `./store` for every query that touches it.
 */

dotenv.config();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

const app = express();

/**
 * Whether `X-Forwarded-For` may be believed.
 *
 * `req.ip` is what the directions proxy rate-limits on, and behind a reverse
 * proxy every request otherwise arrives from the same address — one bucket for
 * the whole internet. Opt-in rather than always-on, because trusting the header
 * when nothing in front strips it lets any caller forge an IP and mint a fresh
 * bucket per request, which is worse than no limiter at all. Set `TRUST_PROXY`
 * to the number of proxies in front of this process (usually `1`), or to a
 * value Express understands such as `loopback`.
 */
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
}

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

/**
 * Liveness, and whether the database behind it is actually reachable.
 *
 * Reports 503 when it is not. A process that is up but cannot reach Supabase
 * serves nothing but 500s, and a health check that says `ok` through that is
 * worse than no health check — it is what keeps a broken instance in the load
 * balancer.
 */
app.get(
  '/api/health',
  guard(async (_req, res) => {
    if (!(await ping())) {
      res.status(503).json({ ok: false, error: 'Database unreachable' });
      return;
    }

    const [jobs, riders] = await Promise.all([store.jobs.count(), store.riders.count()]);
    res.json({ ok: true, jobs, riders, version: '1.0.0' });
  })
);

app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/directions', directionsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/riders', ridersRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/paystack', paystackRouter);

/** The canonical records, for debugging and for the admin dashboard. */
app.get(
  '/api/jobs',
  guard(async (_req, res) => {
    res.json(await store.jobs.list());
  })
);

app.post(
  '/api/reset',
  guard(async (_req, res) => {
    await store.reset();
    await ensureSeeded();
    res.json({ ok: true });
  })
);

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

/** The database host, with the password stripped, for the startup banner. */
function describeDatabase(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? '');
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return 'unknown';
  }
}

/**
 * Boot.
 *
 * The connection is checked and the bootstrap identities are put in place
 * *before* the port opens. Accepting requests first would mean the rider app's
 * very first poll racing the seed, and a sign-in failing against a roster that
 * was about to exist.
 */
async function start(): Promise<void> {
  if (!(await ping())) {
    console.error(
      `[db] cannot reach ${describeDatabase()}. Check DATABASE_URL in apps/server/.env, ` +
        'and that the schema in supabase/migrations has been applied.'
    );
    process.exit(1);
  }

  const seeded = await ensureSeeded();
  const total = seeded.riders + seeded.supervisors + seeded.accounts;
  if (total > 0) {
    console.log(
      `[seed] bootstrapped ${seeded.riders} riders, ${seeded.supervisors} supervisors, ` +
        `${seeded.accounts} accounts`
    );
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`FreshFold dispatch server listening on http://0.0.0.0:${PORT}`);
    console.log(`  data: ${describeDatabase()}`);
    console.log(`  point the rider app at this machine's LAN address on port ${PORT}`);
  });

  // The laundry's own stages advance here rather than on a courier's phone, so
  // a job left at the hub keeps moving after the app that dropped it off is
  // closed. See `./hub`.
  const stopHubCycle = startHubCycle();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stopHubCycle();
      server.close(() => {
        void closeDatabase().finally(() => process.exit(0));
      });
    });
  }
}

void start();
