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
import { store, type Database } from '../store';
import { findJob, nowLabel, notFound, orderView } from '../helpers';

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

ordersRouter.get('/', (req, res) => {
  const riderId = typeof req.query.riderId === 'string' ? req.query.riderId : null;

  const orders = store
    .read()
    .jobs.filter((job) => {
      if (!riderId) return true;
      // A rider sees the open pool plus everything that is already theirs.
      return !job.dispatch.riderId || job.dispatch.riderId === riderId;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(orderView);

  res.json(orders);
});

/** The rider console's simulation hub injecting a job into the backlog. */
ordersRouter.post('/', (req, res) => {
  const incoming = req.body as Order;
  if (!incoming?.id) return res.status(400).json({ error: 'An order needs an id.' });

  const job = store.mutate((db) => {
    const created = orderToJob(incoming);
    const index = db.jobs.findIndex((candidate) => candidate.id === created.id);
    if (index >= 0) db.jobs[index] = created;
    else db.jobs.unshift(created);
    return created;
  });

  res.status(201).json(orderView(job));
});

ordersRouter.post('/:id/accept', (req, res) => {
  const { riderId } = req.body as { riderId?: string };
  if (!riderId) return res.status(400).json({ error: 'A riderId is required to accept a job.' });

  const existing = findJob(req.params.id);
  if (!existing) return notFound(res, 'Order');

  // Two riders racing for the same pickup: first one wins, second gets a 409
  // rather than silently stealing the job.
  if (existing.dispatch.riderId && existing.dispatch.riderId !== riderId) {
    return res.status(409).json({ error: 'That job has already been taken by another rider.' });
  }
  if (isTerminal(existing.status)) {
    return res.status(409).json({ error: 'That job is already closed.' });
  }

  const job = store.mutate((db) => transition(db, req.params.id, { status: 'assigned', riderId }));
  if (!job) return notFound(res, 'Order');

  res.json(orderView(job));
});

ordersRouter.post('/:id/decline', (req, res) => {
  const job = store.mutate((db) => {
    const declined = transition(db, req.params.id, { status: 'unassigned' });
    if (!declined) return null;

    db.notifications.unshift({
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

  if (!job) return notFound(res, 'Order');
  res.json(orderView(job));
});

ordersRouter.patch('/:id/status', (req, res) => {
  const patch = req.body as {
    status?: JobStatus;
    riderId?: string;
    photo?: string;
    signature?: string;
    bags?: LaundryBag[];
  };

  if (!patch?.status) return res.status(400).json({ error: 'A status is required.' });

  const job = store.mutate((db) => transition(db, req.params.id, patch as JobStatusPatch));

  if (!job) return notFound(res, 'Order');
  res.json(orderView(job));
});

/**
 * Applies a transition and records everything that hangs off it — the customer
 * message, and the rider's running totals once a job completes.
 */
function transition(db: Database, id: string, patch: JobStatusPatch): Job | null {
  const index = db.jobs.findIndex((candidate) => candidate.id === id);
  if (index < 0) return null;

  const jobs = db.jobs;
  const previous = jobs[index];
  const updated = applyStatus(previous, patch);
  jobs[index] = updated;

  const line = previous.status !== updated.status ? STATUS_SCRIPT[updated.status] : undefined;
  if (line) {
    db.messages.push({
      id: `msg-${updated.id}-${updated.status}-${Date.now()}`,
      sender: 'dispatcher',
      text: line,
      timestamp: nowLabel(),
      orderId: updated.id,
    });
  }

  if (updated.status === 'delivered' && previous.status !== 'delivered') {
    const rider = db.riders.find((candidate) => candidate.id === updated.dispatch.riderId);
    if (rider) {
      rider.completedCount += 1;
      rider.todayEarnings = Number((rider.todayEarnings + updated.payment.amount).toFixed(2));
      rider.todayDistance = Number((rider.todayDistance + updated.dispatch.distanceKm).toFixed(2));
    }
  }

  return updated;
}
