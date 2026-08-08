/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  accountForToken,
  bearerToken,
  createSession,
  hashPassword,
  requireAuth,
  revokeSession,
  sanitize,
  verifyPassword,
} from '../auth';
import { store, type StoredAccount } from '../store';

/**
 * Sign-up and sign-in.
 *
 * These routes exist so that a password is compared on the server. The client
 * portal used to fetch every account and check the password in the browser,
 * which meant the whole credential table had to be readable by anyone. Now the
 * only thing that crosses the wire is the attempt and a yes/no.
 */
export const authRouter = Router();

const MIN_PASSWORD_LENGTH = 5;

function normalisePhone(phone: string): string {
  return phone.replace(/[\s\-+()]/g, '');
}

authRouter.post('/register', (req, res) => {
  const { email, phone, name, password } = req.body as {
    email?: string;
    phone?: string;
    name?: string;
    password?: string;
  };

  if (!email || !phone || !password) {
    return res.status(400).json({ error: 'Email, phone and password are all required.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const existing = store
    .read()
    .accounts.find(
      (account) =>
        account.email.toLowerCase() === email.toLowerCase() ||
        normalisePhone(account.phone) === normalisePhone(phone)
    );

  // An account created by a booking has no password yet — claiming it is the
  // normal path from the "set up your tracking login" link, not a conflict.
  if (existing?.passwordHash) {
    return res
      .status(409)
      .json({ error: 'An account already exists for this email or phone. Please sign in.' });
  }

  const { salt, hash } = hashPassword(password);

  const account = store.mutate((db) => {
    const index = db.accounts.findIndex(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
    );

    const next: StoredAccount = {
      ...(index >= 0 ? db.accounts[index] : {}),
      email,
      phone,
      name: name || existing?.name || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      passwordSalt: salt,
      passwordHash: hash,
    };

    if (index >= 0) db.accounts[index] = next;
    else db.accounts.push(next);

    return next;
  });

  const session = createSession(account.email);
  res.status(201).json({ token: session.token, account: sanitize(account) });
});

authRouter.post('/login', (req, res) => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Credentials cannot be left empty.' });
  }

  const wanted = identifier.toLowerCase().trim();
  const wantedPhone = normalisePhone(identifier);

  const account = store
    .read()
    .accounts.find(
      (candidate) =>
        candidate.email.toLowerCase().trim() === wanted ||
        normalisePhone(candidate.phone) === wantedPhone
    );

  // One message for "no such account" and "wrong password" alike, so this
  // endpoint can't be used to enumerate who has an account.
  if (!account || !verifyPassword(password, account)) {
    return res.status(401).json({ error: 'No matching patron credentials found.' });
  }

  const session = createSession(account.email);
  res.json({ token: session.token, account: sanitize(account) });
});

authRouter.post('/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) revokeSession(token);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(sanitize(req.account!));
});

/**
 * Whether a contact already has a login, so the portal can route someone to
 * sign-in versus password setup. Returns only a boolean — never a name, never
 * an email, so it reveals nothing an attacker could not already guess.
 */
authRouter.post('/status', (req, res) => {
  const { identifier } = req.body as { identifier?: string };
  if (!identifier) return res.status(400).json({ error: 'An identifier is required.' });

  const wanted = identifier.toLowerCase().trim();
  const wantedPhone = normalisePhone(identifier);

  const account = store
    .read()
    .accounts.find(
      (candidate) =>
        candidate.email.toLowerCase().trim() === wanted ||
        normalisePhone(candidate.phone) === wantedPhone
    );

  res.json({ exists: Boolean(account), hasPassword: Boolean(account?.passwordHash) });
});

export { accountForToken };
