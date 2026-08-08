/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { PaymentTransaction, UserAccount } from '@freshfold/core';
import { sanitize } from '../auth';
import { store, type StoredAccount } from '../store';

/**
 * Customer profiles and the payment ledger.
 *
 * Credentials are not part of this resource. Responses go through `sanitize`,
 * and the writable field list below is an allow-list, so a caller cannot set a
 * password hash by including one in the body. Passwords are only ever set via
 * `/api/auth/register`.
 */
export const accountsRouter = Router();

/** Fields a client is allowed to write through this route. */
type WritableAccountFields = Pick<
  UserAccount,
  'email' | 'phone' | 'name' | 'points' | 'walletBalance'
>;

function pickWritable(body: Partial<UserAccount>): Partial<WritableAccountFields> {
  const { email, phone, name, points, walletBalance } = body;
  const writable: Partial<WritableAccountFields> = {};

  if (email !== undefined) writable.email = email;
  if (phone !== undefined) writable.phone = phone;
  if (name !== undefined) writable.name = name;
  if (points !== undefined) writable.points = points;
  if (walletBalance !== undefined) writable.walletBalance = walletBalance;

  return writable;
}

accountsRouter.get('/', (_req, res) => {
  res.json(store.read().accounts.map(sanitize));
});

accountsRouter.put('/', (req, res) => {
  const incoming = pickWritable((req.body ?? {}) as Partial<UserAccount>);
  if (!incoming.email) return res.status(400).json({ error: 'An account needs an email.' });

  const account = store.mutate((db) => {
    const index = db.accounts.findIndex(
      (candidate) => candidate.email.toLowerCase() === incoming.email!.toLowerCase()
    );

    if (index < 0) {
      const created: StoredAccount = {
        email: incoming.email!,
        phone: incoming.phone ?? '',
        name: incoming.name ?? '',
        createdAt: new Date().toISOString(),
        points: incoming.points,
        walletBalance: incoming.walletBalance,
      };
      db.accounts.push(created);
      return created;
    }

    // Spreading only the allow-listed fields leaves passwordSalt/passwordHash
    // on the stored record untouched.
    db.accounts[index] = { ...db.accounts[index], ...incoming };
    return db.accounts[index];
  });

  res.json(sanitize(account));
});

export const transactionsRouter = Router();

transactionsRouter.get('/', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.toLowerCase() : null;
  const transactions = store
    .read()
    .transactions.filter((t) => !email || t.userEmail?.toLowerCase() === email);
  res.json(transactions);
});

transactionsRouter.post('/', (req, res) => {
  const incoming = req.body as PaymentTransaction;
  if (!incoming?.reference) {
    return res.status(400).json({ error: 'A transaction needs a reference.' });
  }

  store.mutate((db) => {
    const index = db.transactions.findIndex((t) => t.reference === incoming.reference);
    if (index >= 0) db.transactions[index] = incoming;
    else db.transactions.unshift(incoming);
  });

  res.status(201).json(incoming);
});
