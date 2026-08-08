/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { store, type StoredAccount, type StoredSession } from './store';

/**
 * Bearer sessions.
 *
 * Hashing lives in `./passwords`, which has no store dependency; this module
 * layers sessions on top of it and is the only thing that turns a token back
 * into an account.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createSession(email: string): StoredSession {
  const now = Date.now();
  const session: StoredSession = {
    token: randomBytes(32).toString('hex'),
    email: email.toLowerCase(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  store.mutate((db) => {
    // Prune expired tokens while we're here — this is the only place sessions
    // accumulate, so it is the natural place to clear them out.
    db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now);
    db.sessions.push(session);
  });

  return session;
}

export function revokeSession(token: string): void {
  store.mutate((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== token);
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Resolves a bearer token to its account, or null if absent/expired/unknown. */
export function accountForToken(token: string | null): StoredAccount | null {
  if (!token) return null;

  const db = store.read();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  if (Date.parse(session.expiresAt) <= Date.now()) {
    revokeSession(token);
    return null;
  }

  return db.accounts.find((a) => a.email.toLowerCase() === session.email) ?? null;
}

declare module 'express-serve-static-core' {
  interface Request {
    account?: StoredAccount;
  }
}

/** Rejects the request unless it carries a valid session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const account = accountForToken(bearerToken(req));
  if (!account) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }

  req.account = account;
  next();
}
