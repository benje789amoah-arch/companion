/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  applyBookingPatch,
  bookingToJob,
  newJobId,
  type Booking,
} from '@freshfold/core';
import { store } from '../store';
import { bookingView, findJob, notFound } from '../helpers';

/**
 * The customer-facing half of the API — what the website reads and writes.
 *
 * Creating a booking here is the moment a marketing-site form submission
 * becomes a dispatchable job: `bookingToJob` derives the pickup pin, bag
 * manifest, priority and distance, and the record lands in the same pool the
 * rider app pulls from.
 */
export const bookingsRouter = Router();

bookingsRouter.get('/', (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email.toLowerCase() : null;

  const jobs = store
    .read()
    .jobs.filter((job) => !email || job.customer.email.toLowerCase() === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(jobs.map(bookingView));
});

bookingsRouter.get('/:id', (req, res) => {
  const job = findJob(req.params.id);
  if (!job) return notFound(res, 'Booking');
  res.json(bookingView(job));
});

bookingsRouter.post('/', (req, res) => {
  const incoming = req.body as Booking;
  if (!incoming || !incoming.name || !incoming.phone) {
    return res.status(400).json({ error: 'A booking needs at least a name and a phone number.' });
  }

  const booking: Booking = { ...incoming, id: incoming.id || newJobId() };

  const job = store.mutate((db) => {
    const existingIndex = db.jobs.findIndex((candidate) => candidate.id === booking.id);
    const created = bookingToJob(booking);

    // POSTing an id that already exists is an upsert rather than an error:
    // the web app replays its offline queue on reconnect.
    if (existingIndex >= 0) db.jobs[existingIndex] = created;
    else db.jobs.unshift(created);

    db.notifications.unshift({
      id: `notif-${created.id}`,
      title: 'New Pickup Request',
      body: `${created.customer.name} booked ${created.service.type} in ${created.location.suburb}.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'order',
      orderId: created.id,
      read: false,
    });

    return created;
  });

  res.status(201).json(bookingView(job));
});

bookingsRouter.patch('/:id', (req, res) => {
  const patch = req.body as Partial<Booking>;

  const job = store.mutate((db) => {
    const index = db.jobs.findIndex((candidate) => candidate.id === req.params.id);
    if (index < 0) return null;

    const updated = applyBookingPatch(db.jobs[index], patch);
    db.jobs[index] = updated;
    return updated;
  });

  if (!job) return notFound(res, 'Booking');
  res.json(bookingView(job));
});

bookingsRouter.delete('/:id', (req, res) => {
  const removed = store.mutate((db) => {
    const index = db.jobs.findIndex((candidate) => candidate.id === req.params.id);
    if (index < 0) return false;
    db.jobs.splice(index, 1);
    return true;
  });

  if (!removed) return notFound(res, 'Booking');
  res.json({ ok: true });
});

/**
 * There is deliberately no bulk-replace route. The admin dashboard edits the
 * ledger as one array, but a client's copy of it is never guaranteed complete —
 * it may not have synced, and riders create jobs of their own. The web app
 * diffs the array into the per-id writes above instead, so a stale tab can only
 * remove records it actually knew about.
 */
