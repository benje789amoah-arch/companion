/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import type { RiderState, RiderTelemetry } from '@freshfold/core';
import { store } from '../store';
import { notFound } from '../helpers';

/**
 * Rider presence and telemetry.
 *
 * The companion app pushes position here on a timer while a job is active;
 * the website's live dispatch map reads it back through the booking's `rider`
 * field. This is the only channel by which a customer sees a real courier
 * moving on a map.
 */
export const ridersRouter = Router();

ridersRouter.get('/', (_req, res) => {
  res.json(store.read().riders);
});

ridersRouter.get('/:id', (req, res) => {
  const rider = store.read().riders.find((candidate) => candidate.id === req.params.id);
  if (!rider) return notFound(res, 'Rider');
  res.json(rider);
});

/**
 * Upsert rather than update: a rider app installed on a new device should be
 * able to register itself without an separate provisioning step.
 */
ridersRouter.patch('/:id', (req, res) => {
  const telemetry = (req.body ?? {}) as RiderTelemetry;

  const rider = store.mutate((db) => {
    const index = db.riders.findIndex((candidate) => candidate.id === req.params.id);

    if (index < 0) {
      const created: RiderState = {
        id: req.params.id,
        name: '',
        employeeId: '',
        avatar: '',
        vehicle: '',
        vehiclePlate: '',
        rating: 5,
        isOnline: false,
        batteryLevel: 100,
        gpsAccuracy: 1.5,
        speed: 0,
        heading: 180,
        coords: { lat: 6.6852, lng: -1.5815 },
        todayDistance: 0,
        todayEarnings: 0,
        completedCount: 0,
        onTimeRate: 100,
        acceptanceRate: 100,
        completionRate: 100,
        ...telemetry,
      };
      db.riders.push(created);
      return created;
    }

    db.riders[index] = { ...db.riders[index], ...telemetry };
    return db.riders[index];
  });

  res.json(rider);
});
