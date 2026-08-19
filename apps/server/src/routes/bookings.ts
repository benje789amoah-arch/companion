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
  isTerminal,
  newJobId,
  phoneDigits,
  quoteBooking,
  toBookingStatus,
  type Booking,
  type Job,
} from '@freshfold/core';
import { recordAudit } from '../audit';
import { accountForToken, bearerToken } from '../auth';
import { issueTrackingToken, resolveBookingAccess, resolveLister } from '../booking-access';
import { consumeIncludedPickup, settleAccountByEmail } from '../membership';
import { mailBookingConfirmation } from '../setup-links';
import { store } from '../store';
import { charge } from '../wallet';
import { verifyPaystackTransaction } from './integrations';
import { accountBlocked, bookingView, bookingViews, guard, notFound } from '../helpers';

/**
 * The customer-facing half of the API — what the website reads and writes.
 *
 * Creating a booking here is the moment a marketing-site form submission
 * becomes a dispatchable job: `bookingToJob` derives the pickup pin, bag
 * manifest, priority and distance, and the record lands in the same pool the
 * rider app pulls from.
 *
 * Everything except that creation is now behind an identity. This whole file
 * used to be open: `GET /:id` handed out a stranger's address and all three
 * hand-off codes to anybody who could count to `FFC-999999`, and `PATCH` and
 * `DELETE` let them rewrite or remove the order afterwards. See
 * `../booking-access` for who qualifies as whom.
 */
export const bookingsRouter = Router();

/**
 * One customer's orders, or the whole board.
 *
 * Which of the two you get is decided by the token, not by the request. It used
 * to be decided by `?email=`, which is to say by whoever was asking: the address
 * was read straight off the query string, so this route answered any customer's
 * history to anyone who knew their email — and answered the entire ledger to a
 * caller who passed nothing at all, which is what the marketing site did on a
 * five-second timer for every visitor.
 *
 * A customer's own scope still matches the number on their account as well as
 * the address, so a booking placed as a guest under a second address on the same
 * phone is in their history. That part was always right; it is the *source* of
 * the address that was wrong.
 */
bookingsRouter.get(
  '/',
  guard(async (req, res) => {
    const lister = await resolveLister(req);

    if (!lister) {
      res.status(401).json({ error: 'Sign in to see your orders.' });
      return;
    }

    const jobs =
      lister.kind === 'supervisor'
        ? await store.jobs.list()
        : await store.jobs.list({
            email: lister.account.email,
            phone: lister.account.phone ?? null,
          });

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

    // 404 rather than 403 for a caller with no claim on it. A 403 confirms the
    // order exists, which is half of what walking the id space was after.
    if (!(await resolveBookingAccess(req, job))) {
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

    /**
     * What this booking costs, decided here.
     *
     * `amount` used to arrive in the body and go straight onto the job. The price
     * of a wash was therefore whatever the client said it was: a booking could be
     * submitted at ₵0 and land on the board as free work, and since
     * `priorityForBooking` reads the same number, one submitted at ₵999 bought
     * elite dispatch for nothing.
     *
     * The arithmetic is `quoteBooking` in `@freshfold/core` — the same function
     * both booking forms call to show the customer a quote, so the number they
     * approved and the number recorded are the same number, and neither surface
     * can drift from the other again.
     *
     * The plan and the points come off the settled account rather than the
     * request. A membership discount is a paid entitlement and a tier discount is
     * earned; both were previously applied by whichever client bothered — the app
     * did, the website did not, so the same member paid two different prices for
     * the same order depending on where they booked it.
     */
    const quote = quoteBooking({
      selections: {
        serviceType: incoming.serviceType,
        scent: incoming.scent,
        starch: incoming.starch,
        addonIds: incoming.specialtyAddons,
      },
      plan: member?.plan ?? null,
      // `undefined` rather than 0 for a guest: no account, so no tier.
      points: member ? (member.points ?? 0) : undefined,
    });

    const booking: Booking = {
      ...incoming,
      id: incoming.id || newJobId(),
      phone: phoneDigits(incoming.phone),
      momoNumber: incoming.momoNumber ? phoneDigits(incoming.momoNumber) : incoming.momoNumber,
      planId: member?.plan?.planId,
      amount: quote.total,
      /**
       * Nothing is paid at the moment it is booked.
       *
       * The client used to send `paymentStatus: 'Paid'` along with a
       * `transactionRef` it had invented — `'TXN-' + Math.random()` on the website
       * — after verifying a Paystack payment in the browser. So a booking arrived
       * settled on the strength of the browser's own say-so, with a reference that
       * matched nothing in the ledger.
       *
       * The method is an intent and is honoured; the *status* is the server's, and
       * only `POST /:id/payment` below can move it to `Paid`.
       */
      paymentStatus: incoming.paymentMethod === 'Pay on Pickup' ? 'Pay on Pickup' : 'Pending',
      paidAt: undefined,
      transactionRef: undefined,
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

      /**
       * A new booking spends an included pickup only if one was actually applied.
       *
       * `quote.coveredByPlan` is the same decision that waived the laundry fee a
       * few lines above, so the allowance and the discount cannot disagree. It
       * used to fire on `member?.plan` alone, which spent a pickup on work no
       * plan covers — a Family member booking a ₵180 office clean was billed the
       * member rate *and* charged one of their eight monthly pickups for it.
       *
       * Still guarded by `existing`, so a replayed offline write does not spend
       * the allowance twice for one job.
       */
      if (!existing && quote.coveredByPlan && member) {
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

    /**
     * The grant that lets the caller read this booking back.
     *
     * Booking is the one route here that is open to a stranger — that being what
     * a booking form is — so a stranger has to leave with something, or they
     * could not watch the courier they have just summoned. Minted on a replay
     * too: a replayed write is one whose first response never arrived, so the
     * client is holding no token and needs the one it finally gets.
     *
     * Best effort. A booking is on the board and dispatchable at this point, and
     * failing the 201 over the token would lose the pickup to save the tracking
     * of it. A customer who ends up without one signs in instead, which is what
     * the confirmation email is for.
     */
    let trackingToken: string | undefined;
    try {
      trackingToken = await issueTrackingToken(job.id);
    } catch (error) {
      console.error(`[bookings] could not issue a tracking token for ${job.id}:`, error);
    }

    res.status(201).json({ ...view, trackingToken });

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

/**
 * What only the desk may write through a patch.
 *
 * `status` is the dispatch stage: the courier and the hub own it, and a customer
 * echoing their own record back must not move it. `amount` is on the list too: it
 * is derived by `quoteBooking` at creation, and a patch that rewrote it would undo
 * that on the next address correction.
 *
 * Dropped rather than refused, which is the treatment `planId` already gets and
 * for a practical reason: the website diffs its whole ledger into per-id patches,
 * so every edit it sends carries every field of the record. Refusing would fail an
 * address correction because it mentioned a price it was not changing.
 */
const SUPERVISOR_ONLY_FIELDS = ['status', 'amount'] as const;

/**
 * The money. Stripped from every patch, whoever is asking.
 *
 * `POST /:id/payment` owns these four, and it is the only thing that writes them
 * — it takes the money, or verifies that somebody else did, before it stamps
 * anything. A patch cannot do either, so a patch that carries `paymentStatus:
 * 'Paid'` is only ever a claim about a payment.
 *
 * Both clients used to make exactly that claim with a reference they had generated
 * locally, and the desk did it last: `TXN-ADMIN-` plus six random digits, written
 * straight into the ledger because a supervisor token skipped the list above. The
 * desk now settles cash through the payment route like everybody else.
 *
 * `paymentMethod` is here despite being a label rather than a state. It is written
 * once at creation and never deliberately patched, so the only patches that carry
 * it are whole-record echoes — and one from a browser tab holding a stale mirror
 * would put `Pay on Pickup` back on a booking the desk had settled in cash, which
 * reads as a bill that was never collected.
 */
const PAYMENT_LEDGER_FIELDS = [
  'paymentStatus',
  'paymentMethod',
  'paidAt',
  'transactionRef',
] as const;

bookingsRouter.patch(
  '/:id',
  guard(async (req, res) => {
    // `planId` is dropped for the same reason POST derives it rather than
    // accepting it: `applyBookingPatch` would write it onto the job, and a job
    // with a plan is dispatched at elite priority. Membership is granted by
    // /api/accounts/plan and nowhere else, so editing a booking cannot confer
    // one on an order that was not booked under it.
    const { planId: _ignored, ...body } = req.body as Partial<Booking>;

    const outcome = await store.tx(async (t) => {
      const existing = await t.jobs.find(req.params.id, { lock: true });
      if (!existing) return { kind: 'missing' } as const;

      const access = await resolveBookingAccess(req, existing);
      if (!access) return { kind: 'missing' } as const;

      const patch = { ...body };
      for (const field of PAYMENT_LEDGER_FIELDS) delete patch[field];
      if (access.kind !== 'supervisor') {
        for (const field of SUPERVISOR_ONLY_FIELDS) delete patch[field];
      }

      const job = await t.jobs.upsert(applyBookingPatch(existing, patch));

      /**
       * The two supervisor-only fields are the two worth a trail entry.
       *
       * Compared after the patch was applied rather than taken from the request
       * body, because the website sends whole-record echoes: every address
       * correction it makes mentions the stage and the price it is not changing,
       * and an audit trail full of "stage advance: In Care → In Care" is a trail
       * nobody reads. A customer's own edit is not recorded here — they are not
       * the party this pane holds to account, and their changes are theirs.
       */
      if (access.kind === 'supervisor') {
        if (existing.status !== job.status) {
          await recordAudit(t, {
            actor: access.supervisor.email,
            actorName: access.supervisor.name,
            action: 'Stage advance',
            details:
              `Moved order ${job.id} from ${toBookingStatus(existing.status)} to ` +
              `${toBookingStatus(job.status)} by hand`,
            type: 'stage',
            orderId: job.id,
            subject: job.customer.email,
          });
        }

        if (existing.payment.amount !== job.payment.amount) {
          await recordAudit(t, {
            actor: access.supervisor.email,
            actorName: access.supervisor.name,
            action: 'Amount changed',
            details:
              `Changed the bill on order ${job.id} from ` +
              `GHS ${existing.payment.amount.toFixed(2)} to GHS ${job.payment.amount.toFixed(2)}`,
            type: 'payment',
            orderId: job.id,
            subject: job.customer.email,
          });
        }
      }

      return { kind: 'ok', job } as const;
    });

    if (outcome.kind === 'missing') {
      notFound(res, 'Booking');
      return;
    }
    res.json(await bookingView(outcome.job));
  })
);

/**
 * Settles a booking's bill. The only path to `Paid`, and now the only one in fact
 * as well as in this sentence — `PATCH /:id` no longer writes payment fields for
 * anybody, including the desk.
 *
 * Both clients used to do this themselves: verify a Paystack reference in the
 * browser, then PATCH the booking with `paymentStatus: 'Paid'` and a reference
 * they had generated locally. Three things were wrong with that. The browser was
 * the only thing asserting the payment happened; the amount settled was the
 * client's own figure rather than the job's; and the website's wallet path never
 * debited a wallet at all — it subtracted from a React state variable that was
 * hardcoded to zero.
 *
 * Here the amount is read off the job, which is where `quoteBooking` put it. The
 * caller chooses *how* to pay and proves it; they do not get to say what it cost
 * or whether it worked. There are three ways to prove it:
 *
 *  - **Wallet** — the balance moves, in `charge`, on a locked account row.
 *  - **Paystack** — the reference is verified against Paystack, and checked to be
 *    for this booking and for enough.
 *  - **Cash** — a supervisor states that the money was handed over. There is no
 *    third party to verify, so the record says who at the desk recorded it, and
 *    `DELETE /:id/payment` can take it back. This is the honest form of what the
 *    dashboard used to do by inventing a `TXN-ADMIN-` reference.
 */
bookingsRouter.post(
  '/:id/payment',
  guard(async (req, res) => {
    const { method, reference } = (req.body ?? {}) as { method?: string; reference?: string };

    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Booking');
      return;
    }

    const access = await resolveBookingAccess(req, job);
    if (!access) {
      notFound(res, 'Booking');
      return;
    }

    if (job.payment.status === 'Paid') {
      // Idempotent: both clients replay queued writes, and a second attempt on a
      // settled bill is the right answer arriving twice rather than an error.
      res.json(await bookingView(job));
      return;
    }

    const owed = job.payment.amount;
    if (!(owed > 0)) {
      res.status(409).json({ error: 'There is nothing to pay on this booking.' });
      return;
    }

    if (method === 'Wallet') {
      /**
       * The wallet debit and the points it earns happen in `charge`, on a locked
       * account row, with its ledger entry in the same transaction. It is the only
       * thing that moves a balance, and it refuses when the balance cannot cover
       * the bill — which is what makes this a payment rather than a claim.
       *
       * Requires a session: a tracking token identifies a booking, not a wallet.
       */
      if (access.kind !== 'customer') {
        res.status(403).json({
          error: 'Sign in to pay from your FreshFold wallet.',
          reason: 'wallet-needs-session',
        });
        return;
      }

      const outcome = await charge({
        email: access.account.email,
        amount: owed,
        description: `Booking ${job.id} — ${job.service.type}`,
        bookingId: job.id,
        // Deterministic, so a replayed request settles once. The job can only be
        // paid from a wallet once, so the id is the whole of the identity.
        reference: `TXN-BOOKING-${job.id}`,
      });

      if (!outcome.ok) {
        res.status(outcome.reason === 'insufficient-funds' ? 409 : 400).json({
          error:
            outcome.reason === 'insufficient-funds'
              ? `Top up ₵${(outcome.shortfall ?? 0).toFixed(2)} to cover this booking.`
              : 'That payment could not be taken.',
          reason: outcome.reason,
          shortfall: outcome.shortfall,
        });
        return;
      }

      const settled = await markPaid(job.id, 'Wallet', outcome.transaction?.reference);
      res.json(settled ? await bookingView(settled) : await bookingView(job));
      return;
    }

    if (method === 'Paystack') {
      if (!reference?.trim()) {
        res.status(400).json({
          error: 'A card or mobile-money payment needs its Paystack reference.',
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

      /**
       * The payment has to be for *this* booking, and for enough.
       *
       * Without the first check a customer could pay for one ₵30 wash and quote
       * its reference against every other booking they hold — the ledger's
       * idempotency would then make each one look settled. Without the second, a
       * ₵5 payment settles a ₵180 office clean.
       *
       * `booking_id` is the metadata both checkout paths already send. A payment
       * that names no booking is not evidence about one.
       */
      const paidFor = (payment.metadata as { booking_id?: unknown } | undefined)?.booking_id;
      if (typeof paidFor !== 'string' || paidFor !== job.id) {
        res.status(403).json({
          error: 'That payment was not made for this booking.',
          reason: 'reference-not-for-booking',
        });
        return;
      }

      if (payment.amount + 0.01 < owed) {
        res.status(402).json({
          error: `That payment covers ₵${payment.amount.toFixed(2)} of ₵${owed.toFixed(2)}.`,
          reason: 'amount-short',
        });
        return;
      }

      // Recorded against the customer when we know who they are. A guest paying
      // with a tracking token has no account to file a statement under.
      if (access.kind === 'customer') {
        await store.transactions.upsert({
          id: `txn-booking-${job.id}`,
          bookingId: job.id,
          userEmail: access.account.email,
          amount: payment.amount,
          method: 'Paystack',
          status: 'Successful',
          reference: reference.trim(),
          timestamp: new Date().toISOString(),
          description: `Booking ${job.id} — ${job.service.type}`,
        });
      }

      const settled = await markPaid(job.id, 'Paystack', reference.trim());
      res.json(settled ? await bookingView(settled) : await bookingView(job));
      return;
    }

    if (method === 'Cash') {
      /**
       * Money handed to a courier at the door.
       *
       * Nothing external can confirm this — there is no gateway and no balance to
       * move, only somebody at the desk saying the cash arrived. So the record
       * carries who said it, and the reversal below exists because a statement
       * keyed in by hand is a statement that can be keyed in wrongly.
       *
       * Supervisor only, for the same reason: a customer marking their own bill
       * settled in cash is the claim this whole route was written to stop.
       */
      if (access.kind !== 'supervisor') {
        res.status(403).json({
          error: 'Only the desk can record a cash collection.',
          reason: 'cash-needs-supervisor',
        });
        return;
      }

      await store.transactions.upsert({
        id: `txn-booking-${job.id}`,
        bookingId: job.id,
        // The customer's statement, when the booking carries an address that has
        // an account behind it. A guest's does not, and `transactions.list` only
        // ever answers for a signed-in address, so this is harmless either way.
        userEmail: job.customer.email,
        amount: owed,
        method: 'Cash',
        status: 'Successful',
        // Deterministic, and `upsert` conflicts on the reference, so a replayed
        // request records the collection once. Not a gateway reference and not
        // shaped like one: nothing outside this database knows it.
        reference: `CASH-${job.id}`,
        timestamp: new Date().toISOString(),
        description: `Booking ${job.id} — cash collected, recorded by ${access.supervisor.email}`,
      });

      // No reference on the booking itself. The desk's word is what settled this,
      // and a reference in that field would read as a payment some processor had
      // confirmed. The receipt and the ledger show the method instead.
      const settled = await markPaid(job.id, 'Cash', undefined);

      // Filed outside a transaction because this settlement is not one either —
      // the statement row and `markPaid` are already separate round trips. The
      // entry names the amount and the desk, which for a cash collection is the
      // whole of the evidence that it happened.
      await recordAudit(store, {
        actor: access.supervisor.email,
        actorName: access.supervisor.name,
        action: 'Payment settlement',
        details: `Recorded GHS ${owed.toFixed(2)} collected in cash on order ${job.id}`,
        type: 'payment',
        orderId: job.id,
        subject: job.customer.email,
      });

      res.json(settled ? await bookingView(settled) : await bookingView(job));
      return;
    }

    res.status(400).json({
      error: 'A payment needs a method of Wallet, Paystack or Cash.',
    });
  })
);

/**
 * Takes back a cash settlement. Supervisor only.
 *
 * Only cash: it is the one payment nothing outside this database recorded, so it
 * is the one a supervisor can withdraw by saying so. A wallet debit moved a
 * balance and a Paystack payment moved somebody's money, and neither is undone by
 * changing a status — those need a refund, which is a different act with a
 * different record.
 *
 * The booking goes back to `Pay on Pickup` rather than `Pending`, because that is
 * what it is: an unpaid order whose bill is collected at the door.
 */
bookingsRouter.delete(
  '/:id/payment',
  guard(async (req, res) => {
    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Booking');
      return;
    }

    const access = await resolveBookingAccess(req, job);
    if (!access) {
      notFound(res, 'Booking');
      return;
    }

    if (access.kind !== 'supervisor') {
      res.status(403).json({
        error: 'Only the desk can reverse a settlement.',
        reason: 'reversal-needs-supervisor',
      });
      return;
    }

    if (job.payment.status !== 'Paid') {
      // Idempotent, like the settle path: a replayed reversal is the right answer
      // arriving twice.
      res.json(await bookingView(job));
      return;
    }

    if (job.payment.method !== 'Cash') {
      res.status(409).json({
        error:
          `This booking was paid by ${job.payment.method ?? 'another method'}. ` +
          'That money has actually moved, so it needs a refund rather than a change of status.',
        reason: 'not-a-cash-settlement',
      });
      return;
    }

    const amount = job.payment.amount;

    const reversed = await store.tx(async (t) => {
      const current = await t.jobs.find(job.id, { lock: true });
      if (!current) return null;

      // Re-checked under the lock: a refund or a second desk may have moved this
      // between the read above and here.
      if (current.payment.status !== 'Paid' || current.payment.method !== 'Cash') return current;

      return t.jobs.upsert({
        ...current,
        updatedAt: new Date().toISOString(),
        payment: {
          ...current.payment,
          status: 'Pay on Pickup',
          method: undefined,
          transactionRef: undefined,
          paidAt: undefined,
        },
      });
    });

    if (!reversed) {
      notFound(res, 'Booking');
      return;
    }

    /**
     * An offsetting line rather than a deletion of the original.
     *
     * The customer was told the money was received; if that is being taken back,
     * their statement should say so rather than quietly losing the entry. Nothing
     * sums this list — the wallet balance lives on the account and the statement is
     * a display of movements — so this is an audit line, not an accounting entry.
     */
    await store.transactions.upsert({
      id: `txn-booking-${job.id}-reversal`,
      bookingId: job.id,
      userEmail: job.customer.email,
      amount,
      method: 'Cash reversal',
      status: 'Successful',
      reference: `CASH-${job.id}-REVERSAL`,
      timestamp: new Date().toISOString(),
      description: `Booking ${job.id} — cash settlement reversed by ${access.supervisor.email}`,
    });

    // A reversal is the entry most worth having: the desk is withdrawing a claim
    // it made itself, and the customer has already been told the money arrived.
    await recordAudit(store, {
      actor: access.supervisor.email,
      actorName: access.supervisor.name,
      action: 'Payment reversal',
      details:
        `Took back the GHS ${amount.toFixed(2)} cash settlement on order ${job.id}; ` +
        'the bill is collectable at the door again',
      type: 'payment',
      orderId: job.id,
      subject: job.customer.email,
    });

    res.json(await bookingView(reversed));
  })
);

/**
 * Stamps a job as settled, under the row lock.
 *
 * Re-read inside the transaction rather than patching the copy the route is
 * holding: the debit above is a round trip of its own, and the job may have moved
 * on in between.
 */
async function markPaid(
  id: string,
  method: string,
  reference: string | undefined
): Promise<Job | null> {
  return store.tx(async (t) => {
    const job = await t.jobs.find(id, { lock: true });
    if (!job) return null;
    if (job.payment.status === 'Paid') return job;

    return t.jobs.upsert({
      ...job,
      updatedAt: new Date().toISOString(),
      payment: {
        ...job.payment,
        status: 'Paid',
        method,
        transactionRef: reference,
        paidAt: new Date().toISOString(),
      },
    });
  });
}

bookingsRouter.delete(
  '/:id',
  guard(async (req, res) => {
    const job = await store.jobs.find(req.params.id);
    if (!job) {
      notFound(res, 'Booking');
      return;
    }

    const access = await resolveBookingAccess(req, job);
    if (!access) {
      notFound(res, 'Booking');
      return;
    }

    /**
     * A customer clearing their history cannot delete a live pickup.
     *
     * The portal's "remove order from your account history" is this route, and
     * it deletes the job outright rather than hiding a row — so on an order in
     * flight it takes the pickup off the courier's board while they are riding
     * to the door, and takes the desk's record of it with them. Tidying a
     * history is a reasonable thing to want; doing it to a job somebody is
     * currently carrying is not what anybody pressing that button means.
     *
     * The desk is not held to this. A supervisor removing a live order is a
     * decision somebody is making on purpose.
     */
    if (access.kind !== 'supervisor' && !isTerminal(job.status)) {
      res.status(409).json({
        error:
          'This pickup is still in progress, so it cannot be removed yet. ' +
          'Contact the concierge desk if you need it cancelled.',
        code: 'BOOKING_IN_PROGRESS',
      });
      return;
    }

    // The conversation and the desk notifications hang off the job by foreign
    // key, so Postgres takes them with it rather than leaving messages
    // addressed to an order that no longer exists.
    const removed = await store.jobs.remove(req.params.id);

    if (!removed) {
      notFound(res, 'Booking');
      return;
    }

    /**
     * Written after the delete, and on purpose outside it.
     *
     * `audit_events.order_id` carries no foreign key, so this row outlives the
     * job it names — which is the point: a cascade would mean deleting an order
     * also deletes the record of somebody deleting it. The details come from the
     * copy read at the top of this route, because there is nothing left to read
     * them from now. Only the desk's deletions are recorded; a customer clearing
     * their own history is theirs to clear.
     */
    if (access.kind === 'supervisor') {
      await recordAudit(store, {
        actor: access.supervisor.email,
        actorName: access.supervisor.name,
        action: 'Order deleted',
        details:
          `Deleted order ${job.id} for ${job.customer.name} ` +
          `(${job.service.type}, GHS ${job.payment.amount.toFixed(2)}, ` +
          `${toBookingStatus(job.status)})`,
        type: 'order',
        orderId: job.id,
        subject: job.customer.email,
      });
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
