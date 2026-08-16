/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RiderState, UserAccount } from '@freshfold/core';
import type { StoredAccount, StoredRider } from './store';

/**
 * Password hashing, and the one function that makes an account safe to send.
 *
 * Deliberately free of runtime dependencies — the seed data needs to hash
 * passwords while the store is still being constructed, so this module must not
 * import the store back.
 */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  return {
    salt,
    hash: scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex'),
  };
}

/**
 * Compares a secret against a stored salt/hash pair.
 *
 * Takes the pair rather than an account so riders can use it too — their PIN is
 * hashed exactly the same way, and there is no reason for a second copy of this
 * with different field names.
 */
export function verifySecret(
  secret: string,
  stored: { salt?: string; hash?: string }
): boolean {
  if (!stored.salt || !stored.hash) return false;

  const attempt = scryptSync(secret, stored.salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(stored.hash, 'hex');

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (attempt.length !== expected.length) return false;
  return timingSafeEqual(attempt, expected);
}

export function verifyPassword(password: string, account: StoredAccount): boolean {
  return verifySecret(password, { salt: account.passwordSalt, hash: account.passwordHash });
}

/**
 * Strips a courier's credentials so the record can be sent to a client.
 *
 * `mustChangePin` deliberately survives — the console needs to know it is on a
 * provisional credential. `pinExpiresAt` does not: when that deadline falls is
 * the desk's business, and publishing it tells an attacker how long a
 * guessable temporary PIN has left.
 */
export function sanitizeRider(rider: StoredRider): RiderState {
  const { pinSalt, pinHash, active, pinExpiresAt, ...safe } = rider;
  return safe;
}

/**
 * Strips credentials off an account so it can be sent to a client.
 *
 * Every route returning account data goes through this. Handing back a
 * `StoredAccount` directly is precisely the bug this exists to prevent.
 */
export function sanitize(account: StoredAccount): UserAccount {
  const {
    passwordHash,
    passwordSalt,
    // The confirmation link and its clock. A client that could read the digest
    // could confirm an address it does not own, and when the link expires is
    // not the customer's business — the resend button is.
    verificationTokenHash,
    verificationExpiresAt,
    verificationSentAt,
    // Why a supervisor suspended this account. `blockedAt` survives — a client
    // has to know it is looking at a blocked account — but the note behind it
    // is the desk's, and `GET /api/accounts` answers anyone who asks.
    blockedReason,
    ...safe
  } = account;
  return { ...safe, hasPassword: Boolean(passwordHash) };
}
