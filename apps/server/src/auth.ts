/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserAccount } from '@freshfold/core';
import { store, type StoredAccount } from './store';

/**
 * Password handling and bearer sessions.
 *
 * The rule this file exists to enforce: a password is written once, hashed,
 * and never read back. Nothing outside this module sees `passwordHash` or
 * `passwordSalt`, and no response body ever carries them — `sanitize` is the
 * only way an account becomes something a client can be handed.
 */

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredSession {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, account: StoredAccount): boolean {
  if (!account.passwordSalt || !account.passwordHash) return false;

  const attempt = scryptSync(password, account.passwordSalt, SCRYPT_KEYLEN);
  const stored = Buffer.from(account.passwordHash, 'hex');

  // Lengths must match before timingSafeEqual, and it throws if they don't.
  if (attempt.length !== stored.length) return false;
  return timingSafeEqual(attempt, stored);
}

/**
 * Strips credentials off an account so it can be sent to a client.
 *
 * Every route that returns account data goes through this. Returning a
 * `StoredAccount` directly is the bug this function exists to prevent.
 */
export function sanitize(account: StoredAccount): UserAccount {
  const { passwordHash, passwordSalt, ...safe } = account;
  return { ...safe, hasPassword: Boolean(passwordHash) };
}

export function createSession(email: string): StoredSession {
  const now = Date.now();
  const session: StoredSession = {
    token: randomBytes(32).toString('hex'),
    email: email.toLowerCase(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  store.mutate((db) => {
    // Drop anything already expired while we're here; this is the only place
    // sessions accumulate, so it is the natural place to prune them.
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
