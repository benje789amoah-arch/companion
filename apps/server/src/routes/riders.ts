/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import {
  LAUNDRY_HUB,
  PHONE_LENGTH_MESSAGE,
  isCompletePhone,
  phoneDigits,
  type RiderTelemetry,
} from '@freshfold/core';
import {
  bearerToken,
  createSession,
  requireRider,
  requireStaff,
  requireSupervisor,
  revokeSession,
} from '../auth';
import { deskActor, recordAudit } from '../audit';
import { hashPassword, sanitizeRider, verifySecret } from '../passwords';
import { credentialLimit } from '../rateLimit';
import { store, type StoredRider } from '../store';
import { guard, notFound } from '../helpers';

/** How long a provisioned PIN stays usable if the courier never signs in. */
const PROVISIONAL_PIN_TTL_MS = 48 * 60 * 60 * 1000;

/** Next free `FF-R-###`, so ids stay readable rather than becoming UUIDs. */
function newRiderId(existing: string[]): string {
  const taken = new Set(existing);
  for (let n = 101; n < 1000; n++) {
    const id = `FF-R-${n}`;
    if (!taken.has(id)) return id;
  }
  return `FF-R-${Date.now()}`;
}

/**
 * Next free `RIDER-###`.
 *
 * The employee ID is assigned here rather than typed by the supervisor: it is
 * a sign-in identifier, so a typo is a courier who cannot get into the app, and
 * two supervisors adding staff on the same morning will otherwise collide.
 */
function newEmployeeId(existing: string[]): string {
  const taken = new Set(existing.map((value) => value.toLowerCase()));
  for (let n = 101; n < 10000; n++) {
    const id = `RIDER-${n}`;
    if (!taken.has(id.toLowerCase())) return id;
  }
  return `RIDER-${Date.now()}`;
}

/**
 * The only fields a courier's phone may write about itself.
 *
 * An allow-list rather than a list of things to strip, because the two fail in
 * opposite directions. This body arrives off the wire and used to be spread
 * straight onto the stored record, so it wrote whatever it happened to
 * contain — and `StoredRider` contains `pinHash`, `active` and `todayEarnings`
 * alongside the position fields. Anything not named here is dropped without
 * comment, so a field added to the roster tomorrow is not writable by a phone
 * the moment it exists.
 *
 * `todayDistance` is here and `todayEarnings` is not, which is not the
 * inconsistency it looks like: how far a scooter went is a measurement only that
 * phone is in a position to make, and earnings are money this server works out
 * from jobs it saw completed. A phone can overstate its own mileage — which a
 * supervisor can see against the jobs on the board — but it cannot pay itself.
 */
function telemetryFrom(body: unknown): RiderTelemetry {
  const source = (body ?? {}) as Record<string, unknown>;
  const telemetry: RiderTelemetry = {};

  if (typeof source.name === 'string') telemetry.name = source.name;
  if (typeof source.isOnline === 'boolean') telemetry.isOnline = source.isOnline;
  if (typeof source.speed === 'number') telemetry.speed = source.speed;
  if (typeof source.heading === 'number') telemetry.heading = source.heading;
  if (typeof source.gpsAccuracy === 'number') telemetry.gpsAccuracy = source.gpsAccuracy;

  // Kilometres ridden today, as the phone measured them, and the device-local
  // date it measured them on. Nothing here reads that date — it is stored so the
  // same phone can tell today from yesterday after a cold start — but a column
  // that takes any string takes a paragraph, so the shape is checked.
  if (Number.isFinite(source.todayDistance) && (source.todayDistance as number) >= 0) {
    telemetry.todayDistance = source.todayDistance as number;
  }
  if (
    typeof source.distanceDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(source.distanceDate)
  ) {
    telemetry.distanceDate = source.distanceDate;
  }

  const coords = source.coords as { lat?: unknown; lng?: unknown } | undefined;
  if (typeof coords?.lat === 'number' && typeof coords?.lng === 'number') {
    telemetry.coords = { lat: coords.lat, lng: coords.lng };
  }

  return telemetry;
}

/**
 * The courier roster, and everything a signed-in courier does with it.
 *
 * Riders are provisioned, not self-registered: a phone cannot invent a courier
 * by pushing telemetry at an unknown id. Signing in is how a device learns
 * which rider it is, and the token it gets back is what authorises the position
 * updates that put a real courier on the customer's map.
 *
 * Every response goes through `sanitizeRider`. Returning a `StoredRider`
 * directly is exactly the bug that exists to prevent.
 */
export const ridersRouter = Router();

/**
 * Sign in with an employee ID and a PIN.
 *
 * The phone number is accepted as an alternative identifier because a courier
 * who has forgotten their employee ID has certainly not forgotten their own
 * number. Both resolve to the same record.
 *
 * The tightest limit of the three login routes, because this credential is the
 * weakest: a PIN is four digits, which is the right shape for someone wearing
 * gloves at a doorstep and a 10,000-key space to anybody with a script. Eight
 * attempts a quarter-hour puts a full walk of that space beyond three hundred
 * hours, while still leaving a courier who has fat-fingered it in the rain
 * several more goes than they will need.
 */
ridersRouter.post(
  '/login',
  ...credentialLimit({
    perIdentifier: 8,
    perAddress: 30,
    windowMs: 15 * 60 * 1000,
    field: 'identifier',
  }),
  guard(async (req, res) => {
    const { identifier, pin } = (req.body ?? {}) as { identifier?: string; pin?: string };

    if (!identifier || !pin) {
      res.status(400).json({ error: 'An employee ID and PIN are required.' });
      return;
    }

    const rider = await store.riders.findByIdentifier(identifier);

    // One message for "no such courier" and "wrong PIN" alike, so the response
    // cannot be used to work out which employee IDs exist.
    if (!rider || !verifySecret(pin, { salt: rider.pinSalt, hash: rider.pinHash })) {
      res.status(401).json({ error: 'That employee ID and PIN do not match.' });
      return;
    }

    if (rider.active === false) {
      res.status(403).json({ error: 'This courier is no longer on the roster.' });
      return;
    }

    // A temporary PIN that was never used stops working. Checked after the hash
    // comparison so an expired credential cannot be told apart from a wrong one
    // by anybody who does not already know it.
    if (rider.pinExpiresAt && Date.parse(rider.pinExpiresAt) <= Date.now()) {
      res
        .status(403)
        .json({ error: 'That temporary PIN has expired. Ask your supervisor for a new one.' });
      return;
    }

    const session = await createSession('rider', rider.id);
    res.json({ token: session.token, rider: sanitizeRider(rider) });
  })
);

/** Re-validates a stored token on launch, and returns who it belongs to. */
ridersRouter.get('/me', requireRider, (req, res) => {
  res.json(sanitizeRider(req.rider!));
});

/**
 * Replaces a temporary PIN with one only the courier knows.
 *
 * The current PIN is required even though the session already proves identity:
 * a phone left unlocked on a table is not the courier, and this is the one
 * action that changes what gets them back in.
 */
ridersRouter.post(
  '/change-pin',
  requireRider,
  guard(async (req, res) => {
    const { currentPin, newPin } = (req.body ?? {}) as {
      currentPin?: string;
      newPin?: string;
    };

    if (!currentPin || !newPin) {
      res.status(400).json({ error: 'Both the current and the new PIN are required.' });
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      res.status(400).json({ error: 'A PIN is four digits.' });
      return;
    }

    if (newPin === currentPin) {
      res.status(400).json({ error: 'Choose a PIN different from the temporary one.' });
      return;
    }

    const rider = req.rider!;
    if (!verifySecret(currentPin, { salt: rider.pinSalt, hash: rider.pinHash })) {
      res.status(401).json({ error: 'That is not your current PIN.' });
      return;
    }

    const { salt, hash } = hashPassword(newPin);

    await store.riders.update(rider.id, {
      pinSalt: salt,
      pinHash: hash,
      mustChangePin: false,
      // The provisioning deadline is spent; the new PIN has no expiry. An
      // explicit null rather than undefined — the store reads the first as
      // "clear this" and the second as "leave it alone".
      pinExpiresAt: null,
    });

    res.json({ ok: true });
  })
);

ridersRouter.post(
  '/logout',
  guard(async (req, res) => {
    const token = bearerToken(req);
    if (token) await revokeSession(token);
    res.json({ ok: true });
  })
);

/**
 * The roster.
 *
 * Behind a staff session — courier or supervisor: this is the staff list, with
 * names, plates and last known positions. It was open, and the customer app
 * polled it every four seconds for a lookup it never used.
 */
ridersRouter.get(
  '/',
  requireStaff,
  guard(async (_req, res) => {
    const riders = await store.riders.list({ activeOnly: true });
    res.json(riders.map(sanitizeRider));
  })
);

/**
 * Puts a courier on the roster. Supervisor only.
 *
 * The supervisor supplies the courier's details; the employee ID is assigned
 * by the server and comes back in the response, alongside the PIN.
 *
 * The PIN is generated here and returned exactly once. Nobody types it: a
 * supervisor choosing a courier's first credential means the supervisor knows
 * it, and `1234` is what gets chosen under time pressure. It is hashed
 * immediately, expires in 48 hours if unused, and must be replaced on first
 * sign-in.
 */
ridersRouter.post(
  '/',
  requireSupervisor,
  guard(async (req, res) => {
    const { name, phone, vehicle, vehiclePlate } = (req.body ?? {}) as {
      name?: string;
      phone?: string;
      vehicle?: string;
      vehiclePlate?: string;
    };

    if (!phone?.trim()) {
      res.status(400).json({ error: 'A phone number is required.' });
      return;
    }

    // The vehicle is the company's, and the customer is shown it at the door, so
    // it is assigned here rather than typed in later by whoever is riding it.
    if (!vehicle?.trim() || !vehiclePlate?.trim()) {
      res.status(400).json({ error: 'A vehicle and its plate number are required.' });
      return;
    }

    if (!isCompletePhone(phone)) {
      res.status(400).json({ error: PHONE_LENGTH_MESSAGE });
      return;
    }

    const wantedPhone = phoneDigits(phone);
    const temporaryPin = String(Math.floor(1000 + Math.random() * 9000));
    const { salt, hash } = hashPassword(temporaryPin);
    const pinExpiresAt = new Date(Date.now() + PROVISIONAL_PIN_TTL_MS).toISOString();

    /**
     * The clash check and the insert share a transaction so two supervisors
     * adding staff at the same moment cannot both pass the check. If they race
     * anyway the unique index on `lower(employee_id)` is the backstop — the
     * loser gets an error rather than a duplicate roster entry.
     */
    const outcome = await store.tx(async (t) => {
      const clash = await t.riders.findByPhone(wantedPhone);
      if (clash) return { kind: 'clash', employeeId: clash.employeeId } as const;

      const taken = await t.riders.takenIds();

      const rider: StoredRider = {
        id: newRiderId(taken.ids),
        employeeId: newEmployeeId(taken.employeeIds),
        phone: wantedPhone,
        // The courier's own name is theirs to enter; dispatch blocks work until
        // they have. The vehicle came from the supervisor with this request.
        name: name?.trim() ?? '',
        avatar: '',
        vehicle: vehicle.trim(),
        vehiclePlate: vehiclePlate.trim(),
        rating: 0,
        isOnline: false,
        gpsAccuracy: 0,
        speed: 0,
        heading: 0,
        coords: { lat: LAUNDRY_HUB.lat, lng: LAUNDRY_HUB.lng },
        todayDistance: 0,
        distanceDate: '',
        todayEarnings: 0,
        completedCount: 0,
        onTimeRate: 0,
        acceptanceRate: 0,
        completionRate: 0,
        active: true,
        mustChangePin: true,
        pinExpiresAt,
        pinSalt: salt,
        pinHash: hash,
      };

      return { kind: 'ok', rider: await t.riders.insert(rider) } as const;
    });

    if (outcome.kind === 'clash') {
      res
        .status(409)
        .json({ error: `That number is already on the roster as ${outcome.employeeId}.` });
      return;
    }

    // The PIN is deliberately absent. It is a credential, the trail is readable
    // by every desk, and a record of who was hired does not need the password
    // they were hired with.
    await recordAudit(store, {
      ...deskActor(req),
      action: 'Courier hired',
      details:
        `Added ${outcome.rider.name || 'an unnamed courier'} to the roster as ` +
        `${outcome.rider.employeeId} on ${outcome.rider.vehicle} ` +
        `(${outcome.rider.vehiclePlate}), phone ${outcome.rider.phone}`,
      type: 'roster',
      subject: outcome.rider.employeeId,
    });

    res
      .status(201)
      .json({ rider: sanitizeRider(outcome.rider), temporaryPin, pinExpiresAt });
  })
);

/**
 * Reassigns the vehicle a courier rides. Supervisor only.
 *
 * Vehicles move: a scooter goes in for repair and its rider takes another,
 * and a plate typed wrong on a Monday is read out at a customer's door on the
 * Tuesday. Neither is fixed by deleting the courier and starting again, which
 * was the only remedy before this route existed.
 */
ridersRouter.patch(
  '/:id/vehicle',
  requireSupervisor,
  guard(async (req, res) => {
    const { vehicle, vehiclePlate } = (req.body ?? {}) as {
      vehicle?: string;
      vehiclePlate?: string;
    };

    if (!vehicle?.trim() || !vehiclePlate?.trim()) {
      res.status(400).json({ error: 'A vehicle and its plate number are required.' });
      return;
    }

    const rider = await store.riders.update(req.params.id, {
      vehicle: vehicle.trim(),
      vehiclePlate: vehiclePlate.trim(),
    });

    if (!rider) {
      notFound(res, 'Rider');
      return;
    }

    // What it is now, not what it was: nothing here holds a lock, so a "changed
    // from" read before the write could name a plate a second desk had already
    // replaced. The assignment is the fact this route produced.
    await recordAudit(store, {
      ...deskActor(req),
      action: 'Vehicle reassigned',
      details:
        `Assigned ${rider.vehicle} (${rider.vehiclePlate}) to ` +
        `${rider.name || 'an unnamed courier'}, ${rider.employeeId}`,
      type: 'roster',
      subject: rider.employeeId,
    });

    res.json(sanitizeRider(rider));
  })
);

/**
 * Takes a courier off the roster, or puts them back. Supervisor only.
 *
 * Deactivation rather than deletion: a departed courier's jobs still name them,
 * and removing the record would orphan every one. `riderForToken` checks this
 * on every request, so access stops immediately rather than when their token
 * happens to expire.
 */
ridersRouter.patch(
  '/:id/active',
  requireSupervisor,
  guard(async (req, res) => {
    const { active } = (req.body ?? {}) as { active?: boolean };

    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'An `active` boolean is required.' });
      return;
    }

    const rider = await store.riders.update(req.params.id, { active });

    if (!rider) {
      notFound(res, 'Rider');
      return;
    }

    await recordAudit(store, {
      ...deskActor(req),
      action: active ? 'Courier reinstated' : 'Courier deactivated',
      details: active
        ? `Put ${rider.name || 'an unnamed courier'} (${rider.employeeId}) back on the roster`
        : `Took ${rider.name || 'an unnamed courier'} (${rider.employeeId}) off the roster; ` +
          'their sign-in stops working on the next request',
      type: 'roster',
      subject: rider.employeeId,
    });

    res.json(sanitizeRider(rider));
  })
);

ridersRouter.get(
  '/:id',
  requireRider,
  guard(async (req, res) => {
    const rider = await store.riders.find(req.params.id);
    if (!rider) {
      notFound(res, 'Rider');
      return;
    }
    res.json(sanitizeRider(rider));
  })
);

/**
 * Position and presence.
 *
 * A courier may only write their own record. Previously this was an open
 * upsert, so any caller could invent a rider or move an existing one — which
 * on a live map means putting a courier somewhere they are not.
 */
ridersRouter.patch(
  '/:id',
  requireRider,
  guard(async (req, res) => {
    if (req.rider!.id !== req.params.id) {
      res.status(403).json({ error: 'A courier may only update their own record.' });
      return;
    }

    const rider = await store.riders.update(req.params.id, telemetryFrom(req.body));

    if (!rider) {
      notFound(res, 'Rider');
      return;
    }
    res.json(sanitizeRider(rider));
  })
);
