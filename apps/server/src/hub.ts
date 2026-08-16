/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import type { JobStatus } from '@freshfold/core';
import { transition } from './routes/orders';
import { store } from './store';
import { nowLabel } from './helpers';

/**
 * The hub's own half of the workflow.
 *
 * The round trip is semi-automatic by design. The three points where the bags
 * physically change hands are confirmed by a person — the courier scans the
 * customer's collection code at the door, types the desk's code at the hub,
 * takes the customer's code back at the end — and everything *between* those
 * hand-offs advances on its own. Once a courier has finished the collection
 * leg in full, nobody has to press anything for the customer's timeline to
 * keep moving: In Care ripens into Ironing & Folding, and that into Quality
 * Check, at which point the courier is told there is a delivery waiting.
 *
 * This used to run on the courier's phone, as a `setTimeout` in the rider
 * app's store. That made the laundry's progress a property of one device being
 * awake: a courier who closed the app, lost signal or ended their shift after
 * dropping bags off left the job at In Care permanently, with no path out of
 * it except a supervisor noticing and moving it by hand. It also meant the
 * phone stamped its own `riderId` on whatever it ripened, so a stage a
 * supervisor had set from the desk was walked on by whoever happened to be
 * signed in. Both problems are the same problem — the wrong process owned the
 * clock.
 *
 * Here it is one sweep in the server, over jobs that have been sitting in a
 * hub stage longer than its dwell. Every advance goes through the same
 * `transition` a courier's tap does, so the customer message, the timeline and
 * the record read identically whichever moved it.
 *
 * `dotenv.config()` runs here for the reason it runs in `./db`: imports are
 * evaluated before any statement in `index.ts`, so a module that reads
 * `process.env` at load has to load the file itself.
 */

dotenv.config();

/** The stages the hub owns, and what each one ripens into. */
const NEXT_STAGE = {
  dropped_off: 'processing',
  processing: 'ready_for_delivery',
} as const satisfies Partial<Record<JobStatus, JobStatus>>;

type HubStage = keyof typeof NEXT_STAGE;

/**
 * How long each stage takes, in minutes.
 *
 * A stand-in for a hub console nobody has built yet: in a real laundry the
 * press table would mark a load finished, and when it does these become its
 * fallback rather than its clock. Two minutes by default because the value has
 * to be short enough to watch a job go round once, and it is the sort of number
 * that should be obvious rather than buried — set `HUB_WASH_MINUTES` and
 * `HUB_FINISH_MINUTES` to whatever the hub actually takes.
 */
const DEFAULT_DWELL_MINUTES = 2;

/** How often the sweep looks. Finer than this buys nothing a poll can see. */
const TICK_MS = 15_000;

/**
 * Minutes from the environment, as milliseconds.
 *
 * Fractions are allowed and deliberate — `0.1` is six seconds, which is what a
 * demo wants. Anything unparseable or negative falls back rather than throwing:
 * a typo in an optional tuning variable should not stop the server booting, and
 * the warning says which variable to look at.
 */
function dwellMs(variable: string): number {
  const raw = process.env[variable];
  if (!raw?.trim()) return DEFAULT_DWELL_MINUTES * 60_000;

  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) {
    console.warn(
      `[hub] ${variable}="${raw}" is not a number of minutes. ` +
        `Falling back to ${DEFAULT_DWELL_MINUTES}.`
    );
    return DEFAULT_DWELL_MINUTES * 60_000;
  }

  return minutes * 60_000;
}

/** The instant a job must have entered each stage before to be due out of it. */
interface Cutoff {
  droppedOff: string;
  processing: string;
}

function cutoffFor(dwell: { wash: number; finish: number }): Cutoff {
  const now = Date.now();
  return {
    droppedOff: new Date(now - dwell.wash).toISOString(),
    processing: new Date(now - dwell.finish).toISOString(),
  };
}

/**
 * Moves one job on, if it is still where the sweep found it.
 *
 * The status and the clock are both re-checked under the row lock. Between the
 * sweep's read and this transaction a supervisor may have moved the job, a
 * courier may have collected it, or a second instance of this server may have
 * run the same sweep — and in all three cases `updated_at` has moved forward,
 * so the job is no longer due and this call does nothing. That is what keeps
 * the sweep safe to run in more than one process.
 */
async function ripen(id: string, cutoff: Cutoff): Promise<void> {
  await store.tx(async (t) => {
    const job = await t.jobs.find(id, { lock: true });
    if (!job) return;

    const next = NEXT_STAGE[job.status as HubStage];
    if (!next) return;

    const due = job.status === 'dropped_off' ? cutoff.droppedOff : cutoff.processing;
    if (Date.parse(job.updatedAt) > Date.parse(due)) return;

    const updated = await transition(t, job, { status: next });

    /**
     * The one point in the hub cycle somebody has to act on.
     *
     * The customer is told at every stage by `transition`'s script, but the
     * courier is not watching a timeline — they need to know a job they left at
     * the hub hours ago is now bagged and waiting for the ride back. Filed only
     * when a courier is actually holding it: a job a supervisor moved without
     * naming one goes back to the open pool instead, where the whole roster can
     * see it.
     */
    if (next === 'ready_for_delivery') {
      await t.notifications.insert({
        id: `notif-ready-${updated.id}-${Date.now()}`,
        title: updated.dispatch.riderId
          ? 'Ready for delivery'
          : 'Ready for delivery — no courier assigned',
        body:
          `${updated.reference} for ${updated.customer.name} has passed quality check ` +
          `and is packed for the ride back to ${updated.location.deliveryAddress}.`,
        timestamp: nowLabel(),
        type: 'order',
        orderId: updated.id,
        read: false,
      });
    }
  });
}

/**
 * One pass over everything the hub has finished with.
 *
 * Jobs are ripened one at a time rather than in one statement so each gets its
 * own transaction: a job that fails to move — a lock timeout, a row that
 * vanished — should not take the rest of the sweep down with it, and the next
 * tick is fifteen seconds away.
 */
async function sweep(dwell: { wash: number; finish: number }): Promise<void> {
  const cutoff = cutoffFor(dwell);
  const due = await store.jobs.hubDue(cutoff);

  for (const job of due) {
    try {
      await ripen(job.id, cutoff);
    } catch (error) {
      console.error(`[hub] could not advance ${job.reference}:`, error);
    }
  }
}

/**
 * Starts the cycle. Returns the function that stops it.
 *
 * The timer is unref'd so it is never the thing keeping the process alive —
 * the HTTP server is, and a shutdown should not have to wait out a tick.
 */
export function startHubCycle(): () => void {
  const dwell = {
    wash: dwellMs('HUB_WASH_MINUTES'),
    finish: dwellMs('HUB_FINISH_MINUTES'),
  };

  let running = false;

  const tick = async (): Promise<void> => {
    // A sweep that has not finished is not overtaken by the next one. Every
    // ripen takes a row lock, and two overlapping passes would queue behind
    // each other for no gain.
    if (running) return;
    running = true;
    try {
      await sweep(dwell);
    } catch (error) {
      console.error('[hub] sweep failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();

  console.log(
    `[hub] cycle running: In Care ${dwell.wash / 60_000}m → ` +
      `Ironing & Folding ${dwell.finish / 60_000}m → Quality Check`
  );

  return () => clearInterval(timer);
}
