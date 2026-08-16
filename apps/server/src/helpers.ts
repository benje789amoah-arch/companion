/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  jobToBooking,
  jobToOrder,
  type Booking,
  type Job,
  type Order,
  type RiderState,
} from '@freshfold/core';
import { store } from './store';

export async function findJob(id: string): Promise<Job | null> {
  return store.jobs.find(id);
}

export async function findRider(id?: string): Promise<RiderState | undefined> {
  if (!id) return undefined;
  return (await store.riders.find(id)) ?? undefined;
}

/**
 * The customer's view of a job, with the rider's live position attached when
 * one is on it. This is the join that makes the website's dispatch map show a
 * real courier instead of an animation.
 */
export async function bookingView(job: Job): Promise<Booking> {
  return jobToBooking(job, await findRider(job.dispatch.riderId));
}

/**
 * The same view for a whole list, with one query for the couriers instead of
 * one per job.
 *
 * The customer portal asks for a booking history on every poll. Resolving each
 * job's rider on its own would turn a page of twenty orders into twenty-one
 * round trips to Supabase, most of them asking about the same two couriers.
 */
export async function bookingViews(jobs: Job[]): Promise<Booking[]> {
  const riderIds = new Set(
    jobs.map((job) => job.dispatch.riderId).filter((id): id is string => Boolean(id))
  );

  if (riderIds.size === 0) return jobs.map((job) => jobToBooking(job, undefined));

  const riders = await store.riders.list();
  const byId = new Map(riders.map((rider) => [rider.id, rider]));

  return jobs.map((job) => jobToBooking(job, byId.get(job.dispatch.riderId ?? '')));
}

export function orderView(job: Job): Order {
  return jobToOrder(job);
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function notFound(res: Response, what: string): Response {
  return res.status(404).json({ error: `${what} not found` });
}

/**
 * What a suspended customer is told, wherever they meet the block — signing in,
 * claiming an account, booking a pickup.
 *
 * One sentence, in one place, and deliberately not the supervisor's reason: the
 * note behind a block is written for the desk, and a customer reading it back
 * verbatim is not what anybody typing it had in mind. It says who to ask.
 */
export const ACCOUNT_BLOCKED_MESSAGE =
  'This account has been suspended. Please contact FreshFold to have it reviewed.';

/** Machine-readable companion, so an app can route to support rather than parse. */
export const ACCOUNT_BLOCKED_CODE = 'ACCOUNT_BLOCKED';

/** Answers a request from, or about, a suspended account. */
export function accountBlocked(res: Response): Response {
  return res.status(403).json({ error: ACCOUNT_BLOCKED_MESSAGE, code: ACCOUNT_BLOCKED_CODE });
}

/** Wraps an async handler so a rejected promise becomes a 500 instead of a hang. */
export function guard(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((error: unknown) => {
      console.error('[api] unhandled error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    });
  };
}
