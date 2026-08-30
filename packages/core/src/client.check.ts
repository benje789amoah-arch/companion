/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks for the API client's request budget.
 *
 * Run with `npm run check --workspace @freshfold/core`.
 *
 * The behaviour under test is the one described on `COLD_START_TIMEOUT_MS`: a
 * host that may have to be woken gets a minute to do it, and only until it has
 * proved it is running. It is worth assertions because every part of it is
 * invisible from the outside — the symptom of getting it wrong is not a wrong
 * answer but a right answer that arrives after the caller stopped listening,
 * and the customer is told to check their connection.
 *
 * Real timers, with the two budgets shrunk to milliseconds and a stub `fetch`
 * that answers in between them. That keeps the whole file under a second while
 * still exercising the actual `setTimeout`/`AbortController` path rather than a
 * model of it. The clock is injected only where a test needs to skip forward
 * further than it is willing to wait.
 */

import { checkTrue, report, section } from './check';
import { ApiError, COLD_AFTER_IDLE_MS, createClient } from './client';

const REMOTE = 'https://freshfold-server.onrender.com';
const LAN = 'http://192.168.100.39:4000';

/** Budgets small enough to run, far enough apart to tell which one was used. */
const SHORT = 25;
const LONG = 250;
/** Comfortably over `SHORT` and under `LONG`, so it distinguishes them. */
const REPLY_AFTER = 100;

/**
 * A `fetch` that takes `ms` to answer, and honours an abort while it waits.
 *
 * The abort branch is the point of the stub: a `fetch` that ignored the signal
 * would resolve every request eventually and every assertion here would pass
 * whatever budget the client had chosen.
 */
function respondsIn(ms: number, status = 200): typeof fetch {
  return ((_url: unknown, init?: RequestInit) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          resolve(
            new Response(JSON.stringify({ ok: true, version: '1.0.0' }), {
              status,
              headers: { 'Content-Type': 'application/json' },
            })
          ),
        ms
      );
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as typeof fetch;
}

/** Whether a call came back at all — the only thing these assertions ask. */
async function answered(call: Promise<unknown>): Promise<boolean> {
  try {
    await call;
    return true;
  } catch {
    return false;
  }
}

section('a host that can sleep');

{
  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: SHORT,
    coldStartMs: LONG,
    fetchImpl: respondsIn(REPLY_AFTER),
  });

  checkTrue(
    'the first request waits out a cold start',
    await answered(api.health())
  );
  checkTrue(
    'a proven server is held to the short timeout',
    !(await answered(api.health()))
  );
}

{
  // A 401 is the shape of a mistyped password, and the server had to be awake
  // to send it. Waiting a minute on the next attempt would punish the retry.
  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: SHORT,
    coldStartMs: LONG,
    fetchImpl: respondsIn(REPLY_AFTER, 401),
  });

  // The first call spends the cold budget and comes back with the refusal.
  await answered(api.health());

  checkTrue(
    'a refusal still counts as proof of a woken server',
    !(await answered(api.health()))
  );
}

{
  let clock = 1_000_000;
  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: SHORT,
    coldStartMs: LONG,
    now: () => clock,
    fetchImpl: respondsIn(REPLY_AFTER),
  });

  await api.health();
  clock += COLD_AFTER_IDLE_MS + 1;

  checkTrue(
    'a server unheard from for long enough is doubted again',
    await answered(api.health())
  );
}

section('a host that cannot');

{
  const api = createClient({
    baseUrl: LAN,
    timeoutMs: SHORT,
    fetchImpl: respondsIn(REPLY_AFTER),
  });

  checkTrue(
    'a LAN server is never waited on for a wake it cannot need',
    !(await answered(api.health()))
  );
}

{
  const api = createClient({
    baseUrl: LAN,
    timeoutMs: SHORT,
    coldStartMs: LONG,
    fetchImpl: respondsIn(REPLY_AFTER),
  });

  checkTrue(
    'an explicit budget overrides the guess the hostname invites',
    await answered(api.health())
  );
}

{
  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: SHORT,
    coldStartMs: 0,
    fetchImpl: respondsIn(REPLY_AFTER),
  });

  checkTrue('zero opts out of the wait entirely', !(await answered(api.health())));
}

section('what a failed reply says');

/** The message a call rejected with, or '' if it did not reject. */
async function messageFrom(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return '';
  } catch (error) {
    return error instanceof ApiError ? error.message : '';
  }
}

{
  // The gateway's own answer: a status, and a body with no `error` in it. This
  // is what a supervisor met on the sign-in form while Render was waking, and
  // what it used to read out was the method, the path and the number.
  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: LONG,
    coldStartMs: 0,
    fetchImpl: respondsIn(1, 502),
  });

  const message = await messageFrom(api.health());

  checkTrue(
    'a gateway failure is not read out as a request trace',
    !message.includes('502') && !message.includes('/health')
  );
  checkTrue(
    'a gateway failure says the server may be starting up',
    message.toLowerCase().includes('starting back up')
  );
}

{
  // And the server's own refusal keeps its wording — the fallback must not
  // reach a reply that came from us. `/health` answers 503 with an `error`
  // field when Postgres is unreachable, which is the collision worth pinning.
  const stated = ((_url: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: false, error: 'Database unreachable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    )) as typeof fetch;

  const api = createClient({
    baseUrl: REMOTE,
    timeoutMs: LONG,
    coldStartMs: 0,
    fetchImpl: stated,
  });

  checkTrue(
    'a stated error survives a status the gateway also uses',
    (await messageFrom(api.health())) === 'Database unreachable'
  );
}

report();
