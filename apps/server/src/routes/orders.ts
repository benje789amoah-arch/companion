/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  applyStatus,
  isTerminal,
  orderToJob,
  type Job,
  type JobStatus,
  type JobStatusPatch,
  type LaundryBag,
  type Order,
} from '@freshfold/core';
import { store, type Repositories } from '../store';
import { guard, nowLabel, notFound, orderView } from '../helpers';

/**
 * The dispatch half of the API — what the rider app reads and writes.
 *
 * Every transition funnels through `applyStatus` from `@freshfold/core`, so a
 * job's timestamps and proof-of-service attachments are recorded identically
 * no matter which surface triggered the change.
 */
export const ordersRouter = Router();

/** What dispatch narrates to the customer at each step of the workflow. */
const STATUS_SCRIPT: Partial<Record<JobStatus, string>> = {
  assigned: 'A courier has accepted your contract and is preparing transit.',
  navigating_to_pickup: 'Your courier is on the way to the pickup address.',
  arrived_at_pickup: 'Your courier has arrived and is validating the bag scans.',
  picked_up:
    'Pickup documented and confirmed. Your garments are secured for transit to the Central Hub.',
  navigating_to_laundry: 'Your garments are travelling to the FreshFold Central Hub.',
  dropped_off:
    'Garments checked in at the hub. Beginning the meticulous organic cleaning process.',
  processing: 'Artisanal hand-pressing and boutique folding are under way.',
  ready_for_delivery: 'Quality inspection passed. Your garments are packaged and ready.',
  navigating_to_delivery:
    'Scent-infused clean garments are in transit. Your courier is navigating to you.',
  arrived_at_delivery: 'Your courier has arrived with your garments.',
  delivered: 'Concierge delivery complete. Thank you for choosing FreshFold.',
  cancelled: 'This order has been cancelled. Please contact us if this was unexpected.',
};

ordersRouter.get(
  '/',
  guard(async (req, res) => {
    const riderId = typeof req.query.riderId === 'string' ? req.query.riderId : null;
    const jobs = await store.jobs.list({ riderId });
    res.json(jobs.map(orderView));
  })
);

/**
 * One job in full.
 *
 * The list above returns every order without its proof-of-service photographs,
 * which is what keeps a four-second poll cheap. This is where a courier's
 * history screen gets the picture back when it needs to draw one.
 */
ordersRouter.get(
  '/:id',
  guard(async (req, res) => {
    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Order');
      return;
    }
    res.json(orderView(job));
  })
);

/** The rider console's simulation hub injecting a job into the backlog. */
ordersRouter.post(
  '/',
  guard(async (req, res) => {
    const incoming = req.body as Order;
    if (!incoming?.id) {
      res.status(400).json({ error: 'An order needs an id.' });
      return;
    }

    const job = await store.jobs.upsert(orderToJob(incoming));
    res.status(201).json(orderView(job));
  })
);

ordersRouter.post(
  '/:id/accept',
  guard(async (req, res) => {
    const { riderId } = req.body as { riderId?: string };
    if (!riderId) {
      res.status(400).json({ error: 'A riderId is required to accept a job.' });
      return;
    }

    /**
     * The whole check-then-claim runs inside one transaction, on a locked row.
     *
     * Two couriers tapping accept at the same moment used to both read an
     * unassigned job and both write themselves onto it, because the read and
     * the write were separate trips. Now the second one waits for the first to
     * commit and then sees the job it actually has — so the 409 below fires
     * instead of the job silently changing hands.
     */
    const outcome = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return { kind: 'missing' } as const;

      if (existing.dispatch.riderId && existing.dispatch.riderId !== riderId) {
        return { kind: 'taken' } as const;
      }
      if (isTerminal(existing.status)) {
        return { kind: 'closed' } as const;
      }

      /**
       * A job already down the board is claimed where it stands.
       *
       * Most accepts are of something `unassigned`, and `assigned` is the right
       * next step. But a supervisor can move a booking to a courier leg from
       * the dashboard without naming a courier, which leaves it in flight with
       * nobody holding it — the rider console offers those back out. Forcing
       * `assigned` there would rewind a job the customer has been told is
       * Collecting all the way back to Scheduled, on the strength of somebody
       * picking it up.
       */
      const status = existing.status === 'unassigned' ? 'assigned' : existing.status;

      const job = await transition(t, existing, { status, riderId });
      return { kind: 'ok', job } as const;
    });

    switch (outcome.kind) {
      case 'missing':
        notFound(res, 'Order');
        return;
      case 'taken':
        res.status(409).json({ error: 'That job has already been taken by another rider.' });
        return;
      case 'closed':
        res.status(409).json({ error: 'That job is already closed.' });
        return;
      default:
        res.json(orderView(outcome.job));
    }
  })
);

ordersRouter.post(
  '/:id/decline',
  guard(async (req, res) => {
    const job = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return null;

      const declined = await transition(t, existing, { status: 'unassigned' });

      await t.notifications.insert({
        id: `notif-decline-${Date.now()}`,
        title: 'Order Returned to Backlog',
        body: `Order ${declined.reference} was declined and is back in the dispatch queue.`,
        timestamp: nowLabel(),
        type: 'alert',
        orderId: declined.id,
        read: false,
      });

      return declined;
    });

    if (!job) {
      notFound(res, 'Order');
      return;
    }
    res.json(orderView(job));
  })
);

/** The shortest override that is worth having on a record. */
const MIN_OVERRIDE_REASON = 8;

/**
 * The hand-offs the server adjudicates, and what to say when one fails.
 *
 * Keyed by the status being *entered*, because that is the moment the bags
 * actually move. The pickup leg is absent on purpose: the courier scans a QR
 * at a doorstep that may have no signal, so that one is checked on the device
 * against a code the device was sent — a weaker guarantee, bought deliberately
 * for a stairwell in the rain.
 */
const HANDOFF_GATES: Partial<
  Record<
    JobStatus,
    {
      /** Where the expected code lives on the job. */
      otp: 'dropoffOtp' | 'deliveryOtp';
      /** What the courier's app sends it as. */
      field: 'dropoffCode' | 'deliveryCode';
      /** Where an override is written on the job's proof record. */
      reasonKey: 'dropoffOverrideReason' | 'deliveryOverrideReason';
      atKey: 'dropoffOverrideAt' | 'deliveryOverrideAt';
      /** Whether a job carrying no code at all is waved through. */
      legacyPasses: boolean;
      /** How the desk hears about an override. */
      alertTitle: string;
      wrongCode: string;
      noCode: string;
      thinReason: string;
      customerLine: string;
    }
  >
> = {
  dropped_off: {
    otp: 'dropoffOtp',
    field: 'dropoffCode',
    reasonKey: 'dropoffOverrideReason',
    atKey: 'dropoffOverrideAt',
    // Drop-off codes arrived after the ledger did.
    legacyPasses: true,
    alertTitle: 'Bags checked in without a hub code',
    wrongCode: 'That is not the drop-off code for this order.',
    noCode: 'Enter the code on the hub desk’s screen, or record why you cannot.',
    thinReason: 'Say what happened at the hub — a few words at least.',
    customerLine:
      'Your garments were checked in at the hub without the desk code. The courier recorded: ',
  },
  delivered: {
    otp: 'deliveryOtp',
    field: 'deliveryCode',
    reasonKey: 'deliveryOverrideReason',
    atKey: 'deliveryOverrideAt',
    // Every job in the ledger has one.
    legacyPasses: false,
    alertTitle: 'Delivery completed without a code',
    wrongCode: 'That is not the delivery code for this order.',
    noCode: 'Enter the code the customer reads out, or record why you cannot.',
    thinReason: 'Say what happened at the door — a few words at least.',
    customerLine: 'Your order was completed without the delivery code. The courier recorded: ',
  },
};

ordersRouter.patch(
  '/:id/status',
  guard(async (req, res) => {
    const patch = req.body as {
      status?: JobStatus;
      riderId?: string;
      photo?: string;
      signature?: string;
      bags?: LaundryBag[];
      /** The four digits the customer read out at the door. */
      deliveryCode?: string;
      /** The four digits on the hub desk's screen. */
      dropoffCode?: string;
      /** Why the hand-off completed without one. */
      overrideReason?: string;
    };

    if (!patch?.status) {
      res.status(400).json({ error: 'A status is required.' });
      return;
    }

    // Pinned outside the transaction callback: narrowing on a property does
    // not survive into a closure, and the gate below indexes on it.
    const status = patch.status;

    const outcome = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return { kind: 'missing' } as const;

      /**
       * The two transitions a courier's phone cannot make on its own say-so.
       *
       * Somebody else reads out four digits — the customer at their door, the
       * hub desk at the counter — and the courier types them; this is where
       * they are checked, because a check that runs on the courier's device
       * against a code the courier's device was given is not a check. Failing
       * that, the courier writes down why — nobody in, left with the concierge,
       * desk unmanned — and the sentence stays on the job.
       */
      const gate = HANDOFF_GATES[status];

      if (gate) {
        const expected = existing.dispatch[gate.otp];
        const supplied = patch[gate.field]?.trim();
        const reason = patch.overrideReason?.trim();

        /**
         * A job minted before this leg had a code cannot be asked for one.
         *
         * Only reachable for jobs already in the ledger: every path that
         * creates one mints all three codes, and no request body can clear
         * them — `applyBookingPatch` does not write dispatch fields. So an
         * absent code means an old record, not a stripped one, and stranding
         * those at a gate they can never satisfy would leave couriers holding
         * bags they cannot check in.
         */
        if (!expected && gate.legacyPasses) {
          // Nothing to check against; let it through.
        } else {
          const codeMatches = !!expected && !!supplied && supplied === expected;

          if (!codeMatches) {
            if (!reason) {
              return {
                kind: 'refused',
                status: 403,
                error: supplied ? gate.wrongCode : gate.noCode,
              } as const;
            }

            if (reason.length < MIN_OVERRIDE_REASON) {
              return {
                kind: 'refused',
                status: 400,
                error: gate.thinReason,
              } as const;
            }
          }
        }
      }

      const job = await transition(t, existing, patch as JobStatusPatch);
      return { kind: 'ok', job } as const;
    });

    switch (outcome.kind) {
      case 'missing':
        notFound(res, 'Order');
        return;
      case 'refused':
        res.status(outcome.status).json({ error: outcome.error });
        return;
      default:
        res.json(orderView(outcome.job));
    }
  })
);

/**
 * Applies a transition and records everything that hangs off it — the customer
 * message, the desk's notification, and the rider's running totals once a job
 * completes.
 *
 * Takes the already-locked job rather than an id: every caller has just read it
 * under `for update` to make its own checks, and re-reading it here would drop
 * that work on the floor. Takes the transaction handle for the same reason the
 * whole thing is a transaction — four writes that only make sense together.
 *
 * Exported for the hub cycle in `../hub`, which is a caller like any other: the
 * stages it advances have to land on the customer's timeline the same way the
 * courier's do, and a second implementation of that is a second thing to get
 * wrong.
 */
export async function transition(
  t: Repositories,
  previous: Job,
  patch: JobStatusPatch & { overrideReason?: string }
): Promise<Job> {
  const updated = applyStatus(previous, patch);

  // A hand-off completed without the other party's code carries the reason for
  // the rest of the job's life. Attached before the write rather than after:
  // on the JSON store the record and the object in hand were the same thing,
  // so a later mutation still landed. Here the write is the only thing that
  // counts.
  //
  // Keyed off the gate table so the drop-off leg records the same way the
  // delivery leg does, on its own pair of proof fields — an exception at the
  // hub and an exception at the door are different events and a job can carry
  // both.
  const overrideReason = patch.overrideReason?.trim();
  const gate = HANDOFF_GATES[updated.status];
  const isOverride = !!gate && previous.status !== updated.status && !!overrideReason;

  if (gate && isOverride) {
    updated.dispatch.proof = {
      ...updated.dispatch.proof,
      [gate.reasonKey]: overrideReason,
      [gate.atKey]: new Date().toISOString(),
    };
  }

  await t.jobs.upsert(updated);

  if (gate && isOverride) {
    // Tell the desk while somebody can still do something about it.
    await t.notifications.insert({
      id: `notif-override-${updated.id}-${Date.now()}`,
      title: gate.alertTitle,
      body: `${updated.reference} for ${updated.customer.name}: ${overrideReason}`,
      timestamp: nowLabel(),
      type: 'alert',
      orderId: updated.id,
      read: false,
    });

    await t.messages.insert({
      id: `msg-${updated.id}-override-${Date.now()}`,
      sender: 'dispatcher',
      text: `${gate.customerLine}"${overrideReason}". Contact the concierge desk if this is not what you expected.`,
      timestamp: nowLabel(),
      orderId: updated.id,
    });
  }

  const line = previous.status !== updated.status ? STATUS_SCRIPT[updated.status] : undefined;
  if (line) {
    await t.messages.insert({
      id: `msg-${updated.id}-${updated.status}-${Date.now()}`,
      sender: 'dispatcher',
      text: line,
      timestamp: nowLabel(),
      orderId: updated.id,
    });
  }

  if (updated.status === 'delivered' && previous.status !== 'delivered') {
    const rider = updated.dispatch.riderId
      ? await t.riders.find(updated.dispatch.riderId)
      : null;

    if (rider) {
      await t.riders.update(rider.id, {
        completedCount: rider.completedCount + 1,
        todayEarnings: Number((rider.todayEarnings + updated.payment.amount).toFixed(2)),
        todayDistance: Number(
          (rider.todayDistance + updated.dispatch.distanceKm).toFixed(2)
        ),
      });
    }
  }

  return updated;
}
