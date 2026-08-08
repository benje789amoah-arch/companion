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

export function findJob(id: string): Job | undefined {
  return store.read().jobs.find((job) => job.id === id);
}

export function findRider(id?: string): RiderState | undefined {
  if (!id) return undefined;
  return store.read().riders.find((rider) => rider.id === id);
}

/**
 * The customer's view of a job, with the rider's live position attached when
 * one is on it. This is the join that makes the website's dispatch map show a
 * real courier instead of an animation.
 */
export function bookingView(job: Job): Booking {
  return jobToBooking(job, findRider(job.dispatch.riderId));
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
