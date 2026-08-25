/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What creating an account costs a stranger, and what a 500 tells one.
 *
 * Run with `npm run check --workspace @freshfold/server`.
 *
 * Two findings, both about what the API gives away to somebody who has not
 * signed in.
 *
 * `/auth/register` carried no rate limit at all. The comment by `/login`
 * explaining the omission — "`/register` creates rather than guesses" — was
 * true about guessing and wrong about cost: each call mails a confirmation to
 * an address the caller chose, spends the month's quota doing it, runs a
 * blocking `scryptSync`, and answers 409 or 201 in a way that says whether the
 * address is already a customer.
 *
 * `guard()` wraps every async route in the product and answered a rejected
 * promise with `error.message` verbatim, so one malformed request against any
 * of ~90 routes returned the table, column and constraint that failed.
 *
 * The register assertions drive the *real* router. They use a deliberately
 * short password so the handler refuses at validation — before it hashes
 * anything and before it touches the store — which is what lets this run
 * without a database while still proving the limiter is mounted on the route
 * that ships rather than on a copy of it.
 */

import express from 'express';
import { authRouter } from './routes/auth';
import { guard } from './helpers';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${a}\n        want ${e}`}`
  );
}

function checkTrue(label: string, actual: boolean): void {
  check(label, actual, true);
}

function section(title: string): void {
  console.log(`\n--- ${title} ${'-'.repeat(Math.max(0, 55 - title.length))}`);
}

interface Reply {
  status: number;
  body: { error?: string; reference?: string; detail?: string };
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  // Two routes that exist only here, to exercise the wrapper itself.
  app.get(
    '/boom',
    guard(async () => {
      throw new Error('relation "accounts" violates unique constraint "accounts_email_lower_idx"');
    })
  );
  app.get(
    '/boom-nonerror',
    guard(async () => {
      throw 'a bare string, because not everything thrown is an Error';
    })
  );

  const server = app.listen(4613);
  await new Promise((resolve) => server.once('listening', resolve));

  const get = async (path: string): Promise<Reply> => {
    const res = await fetch(`http://127.0.0.1:4613${path}`);
    return { status: res.status, body: (await res.json()) as Reply['body'] };
  };

  /** A register attempt that fails validation before any hashing or lookup. */
  const register = async (email: string, phone: string): Promise<Reply> => {
    const res = await fetch('http://127.0.0.1:4613/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, password: 'x' }),
    });
    return { status: res.status, body: (await res.json()) as Reply['body'] };
  };

  // -------------------------------------------------------------------------
  section('what a 500 says in production');

  /**
   * `guard` reads `NODE_ENV` inside the catch, so the branch can be selected
   * per request. Production is the one that matters: it is the deployment a
   * stranger can reach, and the assertion is about the *whole* body rather than
   * one field, because a leak in `detail` is a leak.
   *
   * The stack traces printed between these lines are the control working — the
   * real error goes to the log, which is the only place it now appears.
   */
  const wasProduction = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const boom = await get('/boom');
  check('a thrown error is still a 500', boom.status, 500);
  check('the message is fixed', boom.body.error, 'Something went wrong on our end. Please try again.');
  checkTrue('nothing in the body names a table', !JSON.stringify(boom.body).includes('accounts'));
  checkTrue('nothing in the body names a constraint', !JSON.stringify(boom.body).includes('constraint'));
  checkTrue('the developer detail is withheld entirely', boom.body.detail === undefined);
  checkTrue('a reference is issued', /^[0-9a-f]{8}$/.test(boom.body.reference ?? ''));

  const second = await get('/boom');
  checkTrue('two failures get different references', boom.body.reference !== second.body.reference);

  const bare = await get('/boom-nonerror');
  check('something thrown that is not an Error is still handled', bare.status, 500);
  checkTrue('and still gives nothing away', !JSON.stringify(bare.body).includes('bare string'));

  section('...and what it adds outside production');

  process.env.NODE_ENV = 'development';

  const dev = await get('/boom');
  checkTrue('a developer still gets the real message', (dev.body.detail ?? '').includes('constraint'));
  checkTrue('but never in the field a client displays', !(dev.body.error ?? '').includes('constraint'));
  check('and the fixed message is the same one', dev.body.error, boom.body.error);

  process.env.NODE_ENV = wasProduction;

  // -------------------------------------------------------------------------
  section('registering is no longer free');

  // Same address four times. The first three are refused on the password, which
  // proves the request reached the handler; the fourth is refused before it.
  const one = await register('flood@example.test', '0244000001');
  check('a first attempt reaches the handler', one.status, 400);
  checkTrue('...and is refused on its contents', (one.body.error ?? '').includes('Password'));

  await register('flood@example.test', '0244000001');
  await register('flood@example.test', '0244000001');

  const fourth = await register('flood@example.test', '0244000001');
  check('the fourth attempt on one address is refused', fourth.status, 429);
  checkTrue('...as a sign-up, not as a sign-in', (fourth.body.error ?? '').includes('sign-up'));
  /**
   * The limit must not become the oracle it was added to close. What matters is
   * that a refused attempt says the same thing whichever address it names — not
   * that the sentence avoids particular words, which is how an earlier version
   * of this assertion managed to fail on the word "already" in our own copy.
   */
  const refusedKnown = await register('flood@example.test', '0244000001');
  check('a refusal is byte-identical whoever it is about', refusedKnown.body.error, fourth.body.error);
  check('...and carries the same status', refusedKnown.status, fourth.status);

  section('and a phone number cannot be walked either');

  // A fresh email each time, so the address bucket above never fills. Without a
  // bucket on the number, this is how the 409 gets used to enumerate phones.
  await register('walk1@example.test', '0244000002');
  await register('walk2@example.test', '0244000002');
  await register('walk3@example.test', '0244000002');

  const fourthPhone = await register('walk4@example.test', '0244000002');
  check('the fourth attempt on one number is refused', fourthPhone.status, 429);

  const spaced = await register('walk5@example.test', '+233 24 400 0002');
  check('the same number written differently shares the bucket', spaced.status, 429);

  section('and one caller cannot spread it around');

  // Distinct addresses and distinct numbers, so only the per-caller bucket is
  // left to stop this. Bounded rather than exact: the two sections above have
  // already spent some of the same allowance, and asserting a precise remainder
  // would be asserting the arithmetic of this file rather than the limiter.
  let blocked = false;
  for (let attempt = 0; attempt < 12 && !blocked; attempt += 1) {
    const reply = await register(`spread${attempt}@example.test`, `02440100${attempt % 10}${attempt}`);
    if (reply.status === 429) blocked = true;
  }
  checkTrue('a caller using fresh details every time is still stopped', blocked);

  server.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
