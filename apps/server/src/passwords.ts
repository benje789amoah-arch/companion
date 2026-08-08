/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { UserAccount } from '@freshfold/core';
import type { StoredAccount } from './store';

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

export function verifyPassword(password: string, account: StoredAccount): boolean {
  if (!account.passwordSalt || !account.passwordHash) return false;

  const attempt = scryptSync(password, account.passwordSalt, SCRYPT_KEYLEN);
  const stored = Buffer.from(account.passwordHash, 'hex');

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (attempt.length !== stored.length) return false;
  return timingSafeEqual(attempt, stored);
}

/**
 * Strips credentials off an account so it can be sent to a client.
 *
 * Every route returning account data goes through this. Handing back a
 * `StoredAccount` directly is precisely the bug this exists to prevent.
 */
export function sanitize(account: StoredAccount): UserAccount {
  const { passwordHash, passwordSalt, ...safe } = account;
  return { ...safe, hasPassword: Boolean(passwordHash) };
}
