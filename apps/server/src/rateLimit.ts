/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RequestHandler } from 'express';

/**
 * A ceiling on what one caller can spend.
 *
 * Both Google proxies — directions and places — are open by necessity: a
 * customer tracking an order has no session, and a booking form is a stranger
 * filling in a form. Neither can require auth without breaking the thing it is
 * for, so what guards the bill is the service area, the cache, and this.
 *
 * In-memory, so it is per-instance: two servers behind a load balancer allow
 * twice the stated rate between them. That is the honest limitation of not
 * having Redis here, and it still turns an unbounded bill into a bounded one.
 *
 * Keyed on `req.ip`, which behind a reverse proxy is the proxy unless
 * `TRUST_PROXY` is set — see the note in `index.ts`.
 */
export function rateLimit(options: {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** What the caller is told when they exceed it. */
  message: string;
}): RequestHandler {
  const callers = new Map<string, { count: number; windowStart: number }>();

  return (req, res, next) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const seen = callers.get(ip);

    if (!seen || now - seen.windowStart > options.windowMs) {
      // Cheap sweep: without it this map is a slow leak keyed by every IP that
      // has ever asked.
      if (callers.size > 5_000) {
        for (const [key, entry] of callers) {
          if (now - entry.windowStart > options.windowMs) callers.delete(key);
        }
      }

      callers.set(ip, { count: 1, windowStart: now });
      return next();
    }

    seen.count += 1;
    if (seen.count > options.max) {
      res.status(429).json({ error: options.message });
      return;
    }

    next();
  };
}
