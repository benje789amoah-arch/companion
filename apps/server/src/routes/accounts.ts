/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  PHONE_LENGTH_MESSAGE,
  isCompletePhone,
  isTerminal,
  phoneDigits,
  type PaymentTransaction,
  type UserAccount,
} from '@freshfold/core';
import { requireAuth, requireSupervisor } from '../auth';
import { cancel, resume, settleAccountByEmail, subscribe } from '../membership';
import { sanitize } from '../passwords';
import { store, type StoredAccount } from '../store';
import { charge, redeem, topUp, type WalletOutcome } from '../wallet';
import { verifyPaystackTransaction } from './integrations';
import { guard, notFound } from '../helpers';

/**
 * Customer profiles and the payment ledger.
 *
 * Credentials are not part of this resource. Responses go through `sanitize`,
 * and the writable field list below is an allow-list, so a caller cannot set a
 * password hash by including one in the body. Passwords are only ever set via
 * `/api/auth/register`.
 */
export const accountsRouter = Router();

/**
 * Fields a client is allowed to write through this route.
 *
 * `points` and `walletBalance` are deliberately not among them any more. Both
 * apps used to compute a new balance locally and PUT it here, which meant the
 * last writer won: a membership renewal debited by the server was silently
 * restored by whichever device next saved a profile, and a client could award
 * itself any number of care points by asking. Money and points move through
 * `/accounts/wallet` below, which decides the arithmetic itself.
 */
type WritableAccountFields = Pick<UserAccount, 'email' | 'phone' | 'name'>;

function pickWritable(body: Partial<UserAccount>): Partial<WritableAccountFields> {
  const { email, phone, name } = body;
  const writable: Partial<WritableAccountFields> = {};

  if (email !== undefined) writable.email = email;
  if (phone !== undefined) writable.phone = phone;
  if (name !== undefined) writable.name = name;

  return writable;
}

accountsRouter.get(
  '/',
  guard(async (_req, res) => {
    const accounts = await store.accounts.list();
    res.json(accounts.map(sanitize));
  })
);

accountsRouter.put(
  '/',
  guard(async (req, res) => {
    const incoming = pickWritable((req.body ?? {}) as Partial<UserAccount>);
    if (!incoming.email) {
      res.status(400).json({ error: 'An account needs an email.' });
      return;
    }

    // A blank number is a profile that has not filled one in yet; a number that
    // is present has to be a whole one.
    if (incoming.phone) {
      if (!isCompletePhone(incoming.phone)) {
        res.status(400).json({ error: PHONE_LENGTH_MESSAGE });
        return;
      }
      incoming.phone = phoneDigits(incoming.phone);
    }

    // Find-then-write, on a locked row: two tabs saving a profile at once
    // would otherwise both find nothing and both insert.
    const account = await store.tx(async (t) => {
      const existing = await t.accounts.find(incoming.email!, { lock: true });

      if (!existing) {
        return t.accounts.insert({
          email: incoming.email!,
          phone: incoming.phone ?? '',
          name: incoming.name ?? '',
          createdAt: new Date().toISOString(),
        });
      }

      // Only the allow-listed fields are written, so password_salt and
      // password_hash on the stored row are untouched.
      return (await t.accounts.updateProfile(existing.email, incoming)) ?? existing;
    });

    res.json(sanitize(account));
  })
);

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * The plan a client holds is decided here, never by the client.
 *
 * These three routes are the only way the membership columns are written — the
 * profile PUT above cannot touch them, by allow-list — and every one of them
 * requires a customer session, because the plan belongs to whoever the bearer
 * token says is asking rather than to whichever email arrives in a body.
 */

accountsRouter.get(
  '/plan',
  requireAuth,
  guard(async (req, res) => {
    const account = await settleAccountByEmail(req.account!.email);
    res.json({ plan: account?.plan ?? null, account: account ? sanitize(account) : null });
  })
);

accountsRouter.post(
  '/plan',
  requireAuth,
  guard(async (req, res) => {
    const planId = (req.body as { planId?: unknown })?.planId;
    if (typeof planId !== 'string') {
      res.status(400).json({ error: 'A subscription needs a plan.' });
      return;
    }

    const outcome = await subscribe(req.account!.email, planId);

    if (!outcome.ok) {
      const status = outcome.reason === 'no-account' ? 404 : outcome.reason === 'unknown-plan' ? 400 : 409;
      res.status(status).json({
        error:
          outcome.reason === 'unknown-plan'
            ? 'That plan is no longer offered.'
            : outcome.reason === 'already-active'
              ? 'That plan is already running on this account.'
              : outcome.reason === 'insufficient-funds'
                ? `Top up ${formatShortfall(outcome.shortfall)} to start this plan.`
                : 'No account for that session.',
        reason: outcome.reason,
        shortfall: outcome.shortfall,
        plan: outcome.account?.plan ?? null,
      });
      return;
    }

    res.json({
      account: sanitize(outcome.account),
      plan: outcome.account.plan ?? null,
      charged: outcome.charged,
      credit: outcome.credit,
    });
  })
);

accountsRouter.delete(
  '/plan',
  requireAuth,
  guard(async (req, res) => {
    // `resume=true` undoes a cancellation the customer changed their mind
    // about, while the period they paid for is still running.
    const resuming = req.query.resume === 'true';
    const outcome = resuming ? await resume(req.account!.email) : await cancel(req.account!.email);

    if (!outcome.ok) {
      res.status(outcome.reason === 'no-plan' ? 409 : 404).json({
        error: outcome.reason === 'no-plan' ? 'No membership to change.' : 'No account for that session.',
        reason: outcome.reason,
      });
      return;
    }

    res.json({
      account: sanitize(outcome.account),
      plan: outcome.account.plan ?? null,
      activeUntil: outcome.activeUntil,
    });
  })
);

function formatShortfall(amount: number | undefined): string {
  return `₵${(amount ?? 0).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Wallet and care points
// ---------------------------------------------------------------------------

/**
 * The one path that moves a balance or a points total.
 *
 * Authenticated, and scoped to whoever the bearer token says is asking — never
 * to an email in the body. Three actions, all of which write the account and
 * its ledger entry in a single transaction:
 *
 *   topup   — credits the wallet against a settled Paystack payment. Earns no
 *             points; points are for laundry.
 *   charge  — debits it and awards a point per whole cedi.
 *   redeem  — spends care points on a reward from the shared catalogue.
 *
 * `reference` makes a movement idempotent: both apps queue writes offline and
 * replay them, and a replay must not move the balance twice. For `topup` it is
 * also the proof of payment, and is required — see the case below.
 */
accountsRouter.post(
  '/wallet',
  requireAuth,
  guard(async (req, res) => {
    const body = (req.body ?? {}) as {
      action?: unknown;
      amount?: unknown;
      method?: unknown;
      description?: unknown;
      bookingId?: unknown;
      rewardId?: unknown;
      reference?: unknown;
    };

    const email = req.account!.email;
    const reference = typeof body.reference === 'string' ? body.reference : undefined;
    const amount = typeof body.amount === 'number' ? body.amount : NaN;

    let outcome: WalletOutcome;

    switch (body.action) {
      case 'topup': {
        /**
         * A top-up is the one movement that creates money, so it is the one
         * movement that cannot be taken on the caller's word.
         *
         * It used to be: the app posted an amount and the server credited it.
         * Any holder of a session token could fund their own wallet with a
         * single curl. Now the request carries only a Paystack reference, and
         * the balance moves by what Paystack says was collected — `body.amount`
         * is ignored entirely.
         */
        if (!reference?.trim()) {
          res.status(400).json({
            error: 'A top-up needs the Paystack reference for the payment that funded it.',
            reason: 'reference-required',
          });
          return;
        }

        const verified = await verifyPaystackTransaction(reference);
        if (!verified.ok) {
          res.status(verified.status).json({ error: verified.error, reason: 'verify-failed' });
          return;
        }

        const payment = verified.verification;

        if (!payment.paid) {
          res.status(402).json({
            error: `Paystack says this payment is ${payment.status}. Complete the checkout and try again.`,
            reason: 'payment-not-settled',
            paystackStatus: payment.status,
          });
          return;
        }

        // The reference has to belong to the session asking to be credited.
        // Paystack references are guessable enough in aggregate, and without
        // this one customer could quote another's and be credited first — the
        // ledger's idempotency would then quietly deny the payer their money.
        if (payment.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
          res.status(403).json({
            error: 'That payment was made by a different account.',
            reason: 'reference-not-yours',
          });
          return;
        }

        // A booking's payment is for the booking. Without this, a customer
        // could pay for a wash and then replay the same reference here to put
        // its value in the wallet as well.
        if (payment.metadata?.type !== 'wallet_topup') {
          res.status(400).json({
            error: 'That payment was not a wallet top-up.',
            reason: 'not-a-topup',
          });
          return;
        }

        outcome = await topUp({
          email,
          amount: payment.amount,
          method: typeof body.method === 'string' ? body.method : 'Paystack',
          reference,
        });
        break;
      }

      case 'charge':
        outcome = await charge({
          email,
          amount,
          description: typeof body.description === 'string' ? body.description : '',
          bookingId: typeof body.bookingId === 'string' ? body.bookingId : undefined,
          reference,
        });
        break;

      case 'redeem':
        outcome = await redeem({
          email,
          rewardId: typeof body.rewardId === 'string' ? body.rewardId : '',
          reference,
        });
        break;

      default:
        res.status(400).json({ error: 'A wallet movement needs an action.' });
        return;
    }

    if (!outcome.ok) {
      const status =
        outcome.reason === 'no-account'
          ? 404
          : outcome.reason === 'bad-amount' || outcome.reason === 'unknown-reward'
            ? 400
            : 409;

      res.status(status).json({
        error:
          outcome.reason === 'bad-amount'
            ? 'A wallet movement needs an amount above zero.'
            : outcome.reason === 'unknown-reward'
              ? 'That reward is no longer offered.'
              : outcome.reason === 'insufficient-funds'
                ? `Top up ${formatShortfall(outcome.shortfall)} to cover this.`
                : outcome.reason === 'insufficient-points'
                  ? `${outcome.shortfall ?? 0} more care points needed for that reward.`
                  : 'No account for that session.',
        reason: outcome.reason,
        shortfall: outcome.shortfall,
      });
      return;
    }

    res.json({
      account: sanitize(outcome.account),
      transaction: outcome.transaction,
    });
  })
);

// ---------------------------------------------------------------------------
// Supervisor actions
// ---------------------------------------------------------------------------

/**
 * Blocking and deletion — the two ways a customer stops being one.
 *
 * Both are behind `requireSupervisor`, and both are registered *after* the plan
 * routes above so that `/accounts/plan` is still matched by `/plan` rather than
 * being read as a customer whose email is the word "plan".
 *
 * Blocking is the reversible one, and the one that stops somebody immediately:
 * their sessions are revoked, `accountForToken` refuses the token they are
 * holding, and sign-in, registration and booking all turn them away. Deletion
 * is for a record that should not exist at all — a duplicate, a test account, a
 * customer exercising their right to be forgotten — and it takes the identity
 * while leaving the orders it booked.
 */

/** What the supervisor who just acted sees, reason and all. */
function patronView(account: StoredAccount): UserAccount {
  return { ...sanitize(account), blockedReason: account.blockedReason };
}

/**
 * Awards or deducts care points. Supervisor only.
 *
 * The desk's adjuster used to write the new total through `PUT /accounts`,
 * which any client could call with any number. Points are an entitlement now:
 * customers earn them by spending, and the only other way they move is a
 * supervisor granting them here, on a locked row, by a delta rather than an
 * absolute — two supervisors crediting the same patron at once would otherwise
 * lose one of the two grants.
 *
 * The reason is for the desk's own audit trail and is not stored on the
 * account; the dashboard logs it alongside the supervisor who pressed the
 * button.
 */
accountsRouter.patch(
  '/:email/points',
  requireSupervisor,
  guard(async (req, res) => {
    const { delta } = (req.body ?? {}) as { delta?: unknown; reason?: string };

    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ error: 'A points adjustment needs a non-zero delta.' });
      return;
    }

    const account = await store.tx(async (t) => {
      const existing = await t.accounts.find(req.params.email, { lock: true });
      if (!existing) return null;

      // Clamped at zero: a deduction larger than the balance takes it to nothing
      // rather than into a debt no part of the product knows how to collect.
      const points = Math.max(0, Math.round((existing.points ?? 0) + delta));
      return t.accounts.updateProfile(existing.email, { points });
    });

    if (!account) {
      notFound(res, 'Account');
      return;
    }

    res.json(sanitize(account));
  })
);

accountsRouter.patch(
  '/:email/blocked',
  requireSupervisor,
  guard(async (req, res) => {
    const { blocked, reason } = (req.body ?? {}) as { blocked?: boolean; reason?: string };

    if (typeof blocked !== 'boolean') {
      res.status(400).json({ error: 'A `blocked` boolean is required.' });
      return;
    }

    const account = await store.accounts.setBlocked(
      req.params.email,
      blocked ? { at: new Date().toISOString(), reason: (reason ?? '').trim() } : null
    );

    if (!account) {
      notFound(res, 'Account');
      return;
    }

    // Outside any transaction, and only on the way in: a customer who is
    // blocked while their app is open should be signed out of it now rather
    // than whenever their week-long token happens to lapse. Lifting a block
    // does not restore the sessions it ended — they sign in again.
    if (blocked) await store.sessions.revokeAllFor('customer', account.email);

    res.json(patronView(account));
  })
);

accountsRouter.delete(
  '/:email',
  requireSupervisor,
  guard(async (req, res) => {
    const account = await store.accounts.find(req.params.email);

    if (!account) {
      notFound(res, 'Account');
      return;
    }

    /**
     * Not while they have a job on the board.
     *
     * A courier may be riding to this customer's door right now, and the job
     * carries the phone number that gets them in the gate. Deleting the account
     * underneath that does not cancel anything — it just removes the person the
     * desk would call about it. Blocking is what stops somebody mid-flight, so
     * the refusal says so.
     */
    const live = (await store.jobs.list({ email: account.email })).filter(
      (job) => !isTerminal(job.status)
    );

    if (live.length > 0) {
      res.status(409).json({
        error:
          `${account.name || account.email} still has ${live.length} order` +
          `${live.length === 1 ? '' : 's'} in progress. Finish or cancel ${
            live.length === 1 ? 'it' : 'them'
          } first, or block the account instead.`,
        code: 'ACCOUNT_HAS_LIVE_ORDERS',
        orders: live.map((job) => job.id),
      });
      return;
    }

    // Sessions first. If the delete fails after this the customer is signed out
    // of an account that still exists, which is recoverable; the other order
    // leaves a live token for a row that has gone.
    await store.sessions.revokeAllFor('customer', account.email);
    await store.accounts.remove(account.email);

    res.json({ ok: true });
  })
);

export const transactionsRouter = Router();

transactionsRouter.get(
  '/',
  guard(async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email : null;
    res.json(await store.transactions.list(email));
  })
);

transactionsRouter.post(
  '/',
  guard(async (req, res) => {
    const incoming = req.body as PaymentTransaction;
    if (!incoming?.reference) {
      res.status(400).json({ error: 'A transaction needs a reference.' });
      return;
    }

    // The reference is the identity that matters — it is what Paystack echoes
    // back on a verify, and what the upsert matches on. `id` is a primary key
    // now rather than a field in an object, so a client that omitted one used
    // to store a record with `id: undefined` and would now fail the insert.
    const transaction = await store.transactions.upsert({
      ...incoming,
      id: incoming.id || incoming.reference,
    });

    res.status(201).json(transaction);
  })
);
