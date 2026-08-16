/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  PHONE_LENGTH_MESSAGE,
  applyBookingPatch,
  bookingToJob,
  isCompletePhone,
  isOutsideServiceArea,
  newJobId,
  phoneDigits,
  type Booking,
} from '@freshfold/core';
import { accountForToken, bearerToken } from '../auth';
import { consumeIncludedPickup, settleAccountByEmail } from '../membership';
import { mailBookingConfirmation } from '../setup-links';
import { store } from '../store';
import { accountBlocked, bookingView, bookingViews, guard, notFound } from '../helpers';

/**
 * The customer-facing half of the API — what the website reads and writes.
 *
 * Creating a booking here is the moment a marketing-site form submission
 * becomes a dispatchable job: `bookingToJob` derives the pickup pin, bag
 * manifest, priority and distance, and the record lands in the same pool the
 * rider app pulls from.
 */
export const bookingsRouter = Router();

/**
 * One customer's orders, or the whole board.
 *
 * Scoping by email also picks up anything booked under the phone number on that
 * account. A customer who booked as a guest from the marketing site — same
 * person, same number, whatever address they typed into the form that day —
 * gets those orders in their history, which is what the website's portal has
 * always shown by filtering in the browser. The number is read off the account
 * rather than taken from the query, so this cannot be used to fish for somebody
 * else's jobs by guessing their mobile.
 */
bookingsRouter.get(
  '/',
  guard(async (req, res) => {
    const email = typeof req.query.email === 'string' ? req.query.email : null;
    const account = email ? await store.accounts.find(email) : null;

    const jobs = await store.jobs.list({ email, phone: account?.phone ?? null });
    res.json(await bookingViews(jobs));
  })
);

bookingsRouter.get(
  '/:id',
  guard(async (req, res) => {
    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Booking');
      return;
    }
    res.json(await bookingView(job));
  })
);

bookingsRouter.post(
  '/',
  guard(async (req, res) => {
    const incoming = req.body as Booking;
    if (!incoming || !incoming.name || !incoming.phone) {
      res.status(400).json({ error: 'A booking needs at least a name and a phone number.' });
      return;
    }

    // The courier calls this number from the doorstep, so a short one is worse
    // than no booking at all.
    if (!isCompletePhone(incoming.phone)) {
      res.status(400).json({ error: PHONE_LENGTH_MESSAGE });
      return;
    }

    // A pin the customer placed is what the courier navigates to, so one that
    // lands outside Kumasi is refused rather than quietly swapped for a derived
    // point the customer never saw — they placed it, they should be told.
    if (incoming.pickupCoords && isOutsideServiceArea(incoming.pickupCoords)) {
      res.status(400).json({ error: 'That pickup pin is outside the FreshFold service area.' });
      return;
    }

    /**
     * A suspended customer cannot book.
     *
     * Matched on the contact details in the form rather than on the session,
     * which is the only thing that works: a blocked account's token resolves to
     * nobody, so checking `holder` below would leave "sign out and book as a
     * guest" as the whole of the bypass. Email or phone, because a new address
     * on the same number is the other obvious way round.
     *
     * Somebody determined can still book under a number FreshFold has never
     * seen — as any stranger can, that being what a booking form is. What this
     * stops is a blocked account walking back in with its history, its saved
     * details and its dispatch priority attached.
     */
    const contact = await store.accounts.findByEmailOrPhone(incoming.email ?? '', incoming.phone);

    if (contact?.blockedAt) {
      accountBlocked(res);
      return;
    }

    // The membership is read off the session, never off the body.
    //
    // `planId` used to arrive from the client and go straight into the job,
    // where `priorityForBooking` turns any non-empty value into `elite`. That
    // made the top dispatch priority free for anyone who could edit a request —
    // and a paying member who booked from a signed-out device got nothing. The
    // token decides, and an unauthenticated booking simply has no plan.
    const holder = await accountForToken(bearerToken(req));

    /**
     * A signed-in customer must have confirmed their address.
     *
     * Scoped to `holder` on purpose. Booking is open to guests — the website's
     * whole funnel is a stranger filling in a form — so there is no account to
     * check when no token arrives, and requiring one here would turn a
     * verification feature into a registration wall.
     *
     * The consequence is worth stating plainly: an unconfirmed customer can
     * still book by signing out first. What this actually buys is that the
     * benefits attached to an account — the membership priority resolved just
     * below, the order history, the saved addresses — cannot be reached from an
     * address nobody has proven they own.
     */
    if (holder && !holder.emailVerified) {
      res.status(403).json({
        error:
          'Confirm your email address before booking. Check your inbox for the link, ' +
          'or request a new one from your account.',
        code: 'EMAIL_UNVERIFIED',
      });
      return;
    }

    const member = holder ? await settleAccountByEmail(holder.email) : null;

    const booking: Booking = {
      ...incoming,
      id: incoming.id || newJobId(),
      phone: phoneDigits(incoming.phone),
      momoNumber: incoming.momoNumber ? phoneDigits(incoming.momoNumber) : incoming.momoNumber,
      planId: member?.plan?.planId,
    };

    const { job, replayed } = await store.tx(async (t) => {
      // POSTing an id that already exists is an upsert rather than an error:
      // the web app replays its offline queue on reconnect.
      const existing = await t.jobs.find(booking.id, { lock: true });
      const created = bookingToJob(booking);

      // `bookingToJob` mints fresh hand-off codes every time it runs. On a
      // replay that would invalidate the code the customer is already looking
      // at — and which the courier is about to be shown — so the originals
      // stand. The job's identity owns the codes, not the request that
      // happened to arrive last.
      //
      // All three, not just the collection one: a replayed offline write used
      // to roll the delivery code out from under a customer who had the order
      // screen open, and the hub code has exactly the same problem.
      if (existing) {
        created.dispatch.pickupOtp = existing.dispatch.pickupOtp;
        created.dispatch.dropoffOtp = existing.dispatch.dropoffOtp;
        created.dispatch.deliveryOtp = existing.dispatch.deliveryOtp;
      }

      const saved = await t.jobs.upsert(created);

      // A new booking under a membership spends one of the period's included
      // pickups. Guarded by `existing` so a replayed offline write does not
      // spend the allowance twice for one job.
      if (!existing && member?.plan) {
        await consumeIncludedPickup(t, member);
      }

      // After the job, never before: the notification carries a foreign key
      // back to it.
      await t.notifications.insert({
        id: `notif-${saved.id}`,
        title: 'New Pickup Request',
        body: `${saved.customer.name} booked ${saved.service.type} in ${saved.location.suburb}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'order',
        orderId: saved.id,
        read: false,
      });

      return { job: saved, replayed: Boolean(existing) };
    });

    const view = await bookingView(job);
    res.status(201).json(view);

    // After the response, and never on a replay.
    //
    // Sent afterwards for the reason `/auth/register` sends its confirmation
    // there: the booking is already saved and dispatchable, and putting
    // Resend's ten-second budget in front of the 201 would risk a customer
    // being told their pickup failed when it is on the board. Skipped on a
    // replay because the offline queue re-POSTs a booking the customer has
    // already been mailed about, and a second copy of the same confirmation
    // reads like a second pickup.
    if (!replayed) void mailBookingConfirmation(view);
  })
);

bookingsRouter.patch(
  '/:id',
  guard(async (req, res) => {
    // `planId` is dropped for the same reason POST derives it rather than
    // accepting it: `applyBookingPatch` would write it onto the job, and a job
    // with a plan is dispatched at elite priority. Membership is granted by
    // /api/accounts/plan and nowhere else, so editing a booking cannot confer
    // one on an order that was not booked under it.
    const { planId: _ignored, ...patch } = req.body as Partial<Booking>;

    const job = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return null;
      return t.jobs.upsert(applyBookingPatch(existing, patch));
    });

    if (!job) {
      notFound(res, 'Booking');
      return;
    }
    res.json(await bookingView(job));
  })
);

bookingsRouter.delete(
  '/:id',
  guard(async (req, res) => {
    // The conversation and the desk notifications hang off the job by foreign
    // key, so Postgres takes them with it rather than leaving messages
    // addressed to an order that no longer exists.
    const removed = await store.jobs.remove(req.params.id);

    if (!removed) {
      notFound(res, 'Booking');
      return;
    }
    res.json({ ok: true });
  })
);

/**
 * There is deliberately no bulk-replace route. The admin dashboard edits the
 * ledger as one array, but a client's copy of it is never guaranteed complete —
 * it may not have synced, and riders create jobs of their own. The web app
 * diffs the array into the per-id writes above instead, so a stale tab can only
 * remove records it actually knew about.
 */
