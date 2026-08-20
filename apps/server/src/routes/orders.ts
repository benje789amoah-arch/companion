/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  applyStatus,
  isTerminal,
  orderToJob,
  toBookingStatus,
  type Job,
  type JobStatus,
  type JobStatusPatch,
  type LaundryBag,
  type Order,
} from '@freshfold/core';
import { requireRider, requireStaff, requireSupervisor } from '../auth';
import { recordAudit } from '../audit';
import { resolveBookingAccess } from '../booking-access';
import { store, type Repositories } from '../store';
import { guard, nowLabel, notFound, orderView, writtenOrderView } from '../helpers';

/**
 * The dispatch half of the API — what the rider app reads and writes.
 *
 * Every transition funnels through `applyStatus` from `@freshfold/core`, so a
 * job's timestamps and proof-of-service attachments are recorded identically
 * no matter which surface triggered the change.
 *
 * All of it is behind a staff session now, and every courier id is read off that
 * session rather than out of a request body. This file used to be open, which on
 * a dispatch API means rather more than a data leak: `?riderId=` decided whose
 * board you were shown, `{ riderId }` in an accept decided who the job was
 * assigned to, and `PATCH /:id/status` moved any job to any stage — so a
 * stranger could take somebody else's pickup, hand it back, or mark it
 * delivered, and the customer would be told so.
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

/**
 * The board.
 *
 * A courier gets the open pool plus everything already theirs; the desk gets
 * everything. Whose board it is comes from the session — `?riderId=` used to
 * decide, which meant any caller could ask for any courier's assignments by
 * naming them.
 */
ordersRouter.get(
  '/',
  requireStaff,
  guard(async (req, res) => {
    const jobs = await store.jobs.list({ riderId: req.rider?.id ?? null });
    res.json(jobs.map(orderView));
  })
);

/**
 * One job in full.
 *
 * The list above returns every order without its proof-of-service photographs,
 * which is what keeps a four-second poll cheap. This is where a courier's
 * history screen gets the picture back when it needs to draw one — including the
 * proof they captured themselves, which is why a courier may read a job they
 * have since handed on. What they may not do is read one that was never theirs.
 */
ordersRouter.get(
  '/:id',
  requireStaff,
  guard(async (req, res) => {
    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Order');
      return;
    }

    // The desk sees any job. A courier sees their own and anything still in the
    // open pool, which is the same board `GET /` would have offered them.
    const rider = req.rider;
    if (rider && job.dispatch.riderId && job.dispatch.riderId !== rider.id) {
      notFound(res, 'Order');
      return;
    }

    res.json(orderView(job));
  })
);

/**
 * Injects a job into the backlog without a booking behind it.
 *
 * The rider console's simulation hub, and behind the desk's session: this writes
 * a dispatchable job from a request body, with the customer's name, address and
 * price all taken on the caller's word. Open, it was a way to put fabricated
 * work on the board.
 */
ordersRouter.post(
  '/',
  requireSupervisor,
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
  requireRider,
  guard(async (req, res) => {
    // Whoever the token says, never whoever the body says. This was read off
    // `req.body.riderId`, so a caller could assign a job to a courier who had
    // not accepted it — or to a courier id that did not exist.
    const riderId = req.rider!.id;

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
        res.json(writtenOrderView(outcome.job));
    }
  })
);

ordersRouter.post(
  '/:id/decline',
  requireRider,
  guard(async (req, res) => {
    const riderId = req.rider!.id;

    const outcome = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return { kind: 'missing' } as const;

      /**
       * Only the courier holding it may hand it back.
       *
       * There was no check at all here, and the route sets `unassigned`
       * unconditionally — so a caller could return somebody else's job to the
       * pool mid-leg, with the customer watching a courier who was suddenly no
       * longer assigned. Declining something already in the pool is a no-op
       * rather than an error: the app fires it on a card it has just been
       * offered, and the pool is where that card already lives.
       */
      if (existing.dispatch.riderId && existing.dispatch.riderId !== riderId) {
        return { kind: 'notYours' } as const;
      }

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

      return { kind: 'ok', job: declined } as const;
    });

    switch (outcome.kind) {
      case 'missing':
        notFound(res, 'Order');
        return;
      case 'notYours':
        res.status(409).json({ error: 'That job belongs to another courier.' });
        return;
      default:
        res.json(writtenOrderView(outcome.job));
    }
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

/**
 * Advances a job.
 *
 * Mostly a courier's route, but not only: the customer's own app completes the
 * delivery leg — they sign for it and read out their code — and attaches a photo
 * when reporting a problem. So the caller may be the courier holding the job, the
 * desk, or the customer it belongs to, and what each is allowed to do differs.
 *
 * What none of them may do is act on somebody else's job, which is what this
 * route allowed: no session at all, so any caller could drive any order to any
 * stage, and `delivered` was reachable by supplying a sentence instead of a code.
 */
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

      const access = await resolveBookingAccess(req, existing);
      if (!access) return { kind: 'missing' } as const;

      /**
       * A courier may only move a job they are holding.
       *
       * A job still in the pool is allowed through so that the claim-by-moving
       * path keeps working: the app pairs an accept with the first leg, and a
       * supervisor can leave a job in flight with nobody on it for the console to
       * pick up where it stands. `resolveBookingAccess` has already refused a
       * courier who holds neither this job nor nothing.
       */
      const riderId = access.kind === 'rider' ? access.rider.id : undefined;

      /**
       * What the customer's own app is allowed to do here.
       *
       * Two things, and only these two. It completes the delivery leg — the
       * signature is theirs to give and the code is theirs to read out — and it
       * attaches a photograph when reporting a problem, at whatever stage the job
       * is already in.
       *
       * The override path is closed to them, which is the point of separating
       * this from the courier's rules: a hand-off completed without a code is an
       * exception somebody has to answer for, and letting the party who holds the
       * code waive it is the same as having no code. A customer sending one is
       * refused rather than quietly ignored — they have their code, and the
       * courier's app has the escape hatch.
       */
      if (access.kind === 'customer' || access.kind === 'tracking') {
        if (patch.overrideReason) {
          return {
            kind: 'refused',
            status: 403,
            error: 'Enter the delivery code to confirm this order.',
          } as const;
        }

        // Anything about the dispatch itself is the courier's to report.
        if (patch.bags || patch.riderId) {
          return {
            kind: 'refused',
            status: 403,
            error: 'That part of the order is updated by your courier.',
          } as const;
        }

        const completing = status === 'delivered';
        const annotating = status === existing.status && !!patch.photo;

        if (!completing && !annotating) {
          return {
            kind: 'refused',
            status: 403,
            error: 'Your courier reports this order’s progress.',
          } as const;
        }
      }

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

      /**
       * The courier comes from the session, never from the body.
       *
       * `riderId` was read straight off the request, so a caller could stamp a
       * transition — and with it the whole job, since `applyStatus` assigns on
       * any patch carrying one — onto a courier who had never seen it. Left
       * undefined for a customer or the desk, which `applyStatus` reads as "do
       * not touch the assignment": the customer confirming their delivery must
       * not un-assign the courier who made it.
       */
      const job = await transition(t, existing, {
        ...(patch as JobStatusPatch),
        riderId,
      });

      /**
       * The desk's moves are recorded; the courier's are not.
       *
       * A courier advancing a job they are holding is already on the customer's
       * timeline, with the codes and photos that back it up, and twenty routine
       * taps per job would bury the thing this trail is for. What it is for is
       * the desk reaching into a job from outside that flow — the Hub tab
       * confirming a wash, the stage stepper putting a stuck order where it
       * belongs — because that is the move nothing else attributes to anybody.
       */
      if (access.kind === 'supervisor' && existing.status !== job.status) {
        const reason = patch.overrideReason?.trim();

        await recordAudit(t, {
          actor: access.supervisor.email,
          actorName: access.supervisor.name,
          action: 'Stage confirmed',
          details:
            `Moved ${job.reference} from ${toBookingStatus(existing.status)} to ` +
            `${toBookingStatus(job.status)} from the desk` +
            (reason ? `, without the hand-off code: ${reason}` : ''),
          type: 'stage',
          orderId: job.id,
          subject: job.customer.email,
        });
      }

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
        res.json(writtenOrderView(outcome.job));
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

  /**
   * The one point in the round trip somebody has to act on.
   *
   * The customer is told at every stage by the script above, but the courier is
   * not watching a timeline — they need to know a job they left at the hub hours
   * ago is now bagged and waiting for the ride back. The title says when nobody
   * is holding it: a job that reached this stage without a courier named goes
   * back to the open pool, where the whole roster can see it.
   *
   * Lives here rather than in `../hub` because the hub cycle is no longer the
   * only thing that makes this move. A supervisor confirming the press table has
   * finished a load has to send the same notification, and a notification that
   * only fires when a timer moved the job would have been the courier's silence
   * for every load a person confirmed.
   */
  if (updated.status === 'ready_for_delivery' && previous.status !== 'ready_for_delivery') {
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

  if (updated.status === 'delivered' && previous.status !== 'delivered') {
    const rider = updated.dispatch.riderId
      ? await t.riders.find(updated.dispatch.riderId)
      : null;

    if (rider) {
      // `todayDistance` is not credited here any more. What this added was
      // `dispatch.distanceKm` — the straight line from the hub to the pickup,
      // measured once at booking — so it undercounted on two axes at once: a
      // chord instead of the road, and one leg instead of the ride back. The
      // courier's phone now reports the distance it measured between its own GPS
      // fixes, and adding this on top of that would count the same ride twice.
      await t.riders.update(rider.id, {
        completedCount: rider.completedCount + 1,
        todayEarnings: Number((rider.todayEarnings + updated.payment.amount).toFixed(2)),
      });
    }
  }

  return updated;
}
