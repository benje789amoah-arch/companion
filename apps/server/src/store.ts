/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  phoneKey,
  type ActivePlan,
  type AuditEvent,
  type Job,
  type Message,
  type Notification,
  type PaymentTransaction,
} from '@freshfold/core';
import { sql, type Executor } from './db';
import {
  toAccount,
  toAuditEvent,
  toJob,
  toMessage,
  toNotification,
  toRider,
  toSession,
  toSetupToken,
  toSupervisor,
  toTrackingToken,
  toTransaction,
  type AccountRow,
  type AuditEventRow,
  type JobRow,
  type MessageRow,
  type NotificationRow,
  type RiderRow,
  type SessionKind,
  type SessionRow,
  type SetupTokenRow,
  type StoredAccount,
  type StoredRider,
  type StoredSession,
  type StoredSetupToken,
  type StoredSupervisor,
  type StoredTrackingToken,
  type SupervisorRow,
  type TrackingTokenRow,
  type TransactionRow,
} from './rows';

/**
 * The data layer.
 *
 * Every function here takes the executor it runs on, so one body serves both a
 * standalone call and a step inside `store.tx()`. That matters because several
 * operations are not one write: completing a delivery updates the job, appends
 * a customer message, files a notification and moves the courier's running
 * totals. On the JSON file those four happened to be atomic because they were
 * four lines in one synchronous function. Here they have to be asked for, and
 * `store.tx()` is how.
 *
 * Reads use `select *` deliberately. The mappers in `./rows` build their
 * results field by field, so the generated columns (`rider_id`, `phone_key`)
 * come back and are discarded rather than needing to be excluded query by
 * query — and, more importantly, they can never reach a client by accident.
 */

// Re-exported so callers keep importing record types from the store, as they
// did when it owned them.
export type {
  SessionKind,
  StoredAccount,
  StoredRider,
  StoredSession,
  StoredSetupToken,
  StoredSupervisor,
  StoredTrackingToken,
  SupervisorProfile,
} from './rows';

/**
 * A courier update.
 *
 * `pinExpiresAt` is the one field with three states rather than two: absent
 * leaves it alone, a string sets a deadline, and `null` clears one. Replacing a
 * provisional PIN needs that third state — the deadline is spent, and the PIN
 * the courier chose has no expiry.
 */
export type RiderPatch = Partial<Omit<StoredRider, 'pinExpiresAt'>> & {
  pinExpiresAt?: string | null;
};

/** camelCase field → column, for the partial updates couriers push. */
const RIDER_COLUMNS: Record<string, string> = {
  name: 'name',
  avatar: 'avatar',
  phone: 'phone',
  employeeId: 'employee_id',
  vehicle: 'vehicle',
  vehiclePlate: 'vehicle_plate',
  isOnline: 'is_online',
  gpsAccuracy: 'gps_accuracy',
  speed: 'speed',
  heading: 'heading',
  coords: 'coords',
  rating: 'rating',
  todayDistance: 'today_distance',
  distanceDate: 'distance_date',
  todayEarnings: 'today_earnings',
  completedCount: 'completed_count',
  onTimeRate: 'on_time_rate',
  acceptanceRate: 'acceptance_rate',
  completionRate: 'completion_rate',
  mustChangePin: 'must_change_pin',
  pinSalt: 'pin_salt',
  pinHash: 'pin_hash',
  pinExpiresAt: 'pin_expires_at',
  active: 'active',
};

function riderAssignments(patch: RiderPatch): Record<string, unknown> {
  const assignments: Record<string, unknown> = {};

  for (const [field, column] of Object.entries(RIDER_COLUMNS)) {
    const value = (patch as Record<string, unknown>)[field];
    // `undefined` means the caller did not mention the field. `null` is a
    // deliberate clear, and has to survive to the query.
    if (value !== undefined) assignments[column] = value;
  }

  return assignments;
}

/**
 * The comparable part of a number, matching the generated `phone_key` columns.
 *
 * Returns null below nine digits so a half-typed number matches nothing, which
 * is what `samePhone` returns for one.
 */
function phoneLookup(value: string | undefined): string | null {
  if (!value) return null;
  const key = phoneKey(value);
  return key.length === 9 ? key : null;
}

/**
 * `dispatch`, minus the four proof-of-service blobs.
 *
 * A proof photo is a base64 JPEG living inside the `dispatch` jsonb, and every
 * list route used to hand back all of them: three surfaces poll their lists
 * every four to five seconds, so a desk watching thirty live orders was pulling
 * every photograph on the board out of TOAST storage, across the wire from
 * Supabase and down to the browser, twelve times a minute — to render a table
 * that shows none of them. They are fetched one order at a time now, from the
 * `/:id` routes, at the moment something actually displays them.
 *
 * The override reasons stay: they are a sentence each, and they are exactly
 * what a supervisor scanning the board needs to see without opening anything.
 *
 * Removing keys rather than naming the ones to keep is deliberate — a field
 * added to `JobProof` later should arrive in the list by default and be dropped
 * here on purpose, not vanish because nobody updated an allow-list.
 */
function DISPATCH_WITHOUT_PROOF(exec: Executor) {
  return exec`dispatch #- '{proof,pickupPhoto}' #- '{proof,pickupSignature}' #- '{proof,deliveryPhoto}' #- '{proof,deliverySignature}'`;
}

function repositories(exec: Executor) {
  return {
    // -----------------------------------------------------------------------
    // Jobs
    // -----------------------------------------------------------------------
    jobs: {
      /**
       * `riderId` returns the open pool plus everything already theirs, which
       * is what the rider console's board is. `email` narrows to one
       * customer's history.
       *
       * `phone` widens that narrowing rather than tightening it: given both,
       * a job matches on either. Somebody who booked as a guest under a second
       * address is the same customer, and the website's portal has always shown
       * them those orders by filtering `email OR samePhone(phone)` in the
       * browser. Doing it here is what lets the app see the same list — and
       * lets the portal stop pulling every customer's orders down to filter.
       *
       * The four proof-of-service blobs are left in the database. See
       * `DISPATCH_WITHOUT_PROOF` — a job from here is a *summary*, and handing
       * one back to `upsert` would erase the photographs it is missing.
       */
      async list(
        filter: { riderId?: string | null; email?: string | null; phone?: string | null } = {}
      ): Promise<Job[]> {
        const key = phoneLookup(filter.phone ?? undefined);

        const rows = await exec<JobRow[]>`
          select
            id, reference, status, created_at, updated_at,
            customer, service, schedule, location, payment,
            ${DISPATCH_WITHOUT_PROOF(exec)} as dispatch
          from jobs
          where ${
            filter.riderId
              ? exec`(rider_id is null or rider_id = ${filter.riderId})`
              : exec`true`
          }
            and ${
              filter.email
                ? key
                  ? exec`(customer_email = ${filter.email.toLowerCase()} or customer_phone_key = ${key})`
                  : exec`customer_email = ${filter.email.toLowerCase()}`
                : exec`true`
            }
          order by created_at desc, id desc
        `;
        return rows.map(toJob);
      },

      /**
       * `lock` takes a row lock for the rest of the transaction, and is how a
       * read-modify-write through `applyStatus` stays a single step. Two
       * couriers racing for the same pickup now queue at the database rather
       * than both reading an unassigned job and both winning.
       */
      async find(id: string, opts: { lock?: boolean } = {}): Promise<Job | null> {
        const rows = await exec<JobRow[]>`
          select * from jobs where id = ${id} ${opts.lock ? exec`for update` : exec``}
        `;
        return rows[0] ? toJob(rows[0]) : null;
      },

      async upsert(job: Job): Promise<Job> {
        const rows = await exec<JobRow[]>`
          insert into jobs (
            id, reference, status, created_at, updated_at,
            customer, service, schedule, location, dispatch, payment
          ) values (
            ${job.id}, ${job.reference}, ${job.status}, ${job.createdAt}, ${job.updatedAt},
            ${exec.json(job.customer as never)}, ${exec.json(job.service as never)},
            ${exec.json(job.schedule as never)}, ${exec.json(job.location as never)},
            ${exec.json(job.dispatch as never)}, ${exec.json(job.payment as never)}
          )
          on conflict (id) do update set
            reference  = excluded.reference,
            status     = excluded.status,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            customer   = excluded.customer,
            service    = excluded.service,
            schedule   = excluded.schedule,
            location   = excluded.location,
            dispatch   = excluded.dispatch,
            payment    = excluded.payment
          returning *
        `;
        return toJob(rows[0]);
      },

      /**
       * Jobs the hub has been sitting on long enough to move on.
       *
       * The two in-hub stages have their own dwell, so they get their own
       * cutoff rather than one shared one — washing and finishing are not the
       * same length of work and there is no reason to pretend they are.
       *
       * `updated_at` is the clock because it is stamped by `applyStatus` on
       * every transition, so it is exactly "how long this job has been in the
       * stage it is in". Nothing else on the record answers that.
       */
      async hubDue(cutoff: { droppedOff: string; processing: string }): Promise<Job[]> {
        const rows = await exec<JobRow[]>`
          select * from jobs
          where (status = 'dropped_off' and updated_at <= ${cutoff.droppedOff})
             or (status = 'processing'  and updated_at <= ${cutoff.processing})
          order by updated_at
        `;
        return rows.map(toJob);
      },

      async remove(id: string): Promise<boolean> {
        const result = await exec`delete from jobs where id = ${id}`;
        return result.count > 0;
      },

      async count(): Promise<number> {
        const rows = await exec<{ count: number }[]>`select count(*)::int as count from jobs`;
        return rows[0].count;
      },

      /**
       * How many collections are already booked into each window on a day.
       *
       * A collection window is a courier's hour, and there are only so many
       * couriers — so this is the number the booking form has to respect.
       * Nothing counted it before: `PICKUP_TIME_SLOTS` existed in the two forms
       * and had **no references anywhere in the server**, so every customer in
       * Ayeduase could book the same 08:00–11:00 window and nothing refused the
       * eleventh.
       *
       * Cancelled jobs are excluded. A window does not stay full because
       * somebody changed their mind, and counting them would let a morning of
       * cancellations lock out a whole day.
       *
       * Grouped in one query rather than one per slot: the booking form asks for
       * a whole day at a time, and three round trips to answer one screen is
       * three chances for them to disagree with each other.
       */
      async countByPickupSlot(pickupDate: string): Promise<Record<string, number>> {
        const rows = await exec<{ slot: string; count: number }[]>`
          select schedule ->> 'pickupTime' as slot, count(*)::int as count
          from jobs
          where schedule ->> 'pickupDate' = ${pickupDate}
            and status <> 'cancelled'
          group by 1
        `;

        const counts: Record<string, number> = {};
        for (const row of rows) {
          if (row.slot) counts[row.slot] = row.count;
        }
        return counts;
      },
    },

    // -----------------------------------------------------------------------
    // Ratings
    // -----------------------------------------------------------------------
    ratings: {
      /**
       * Records a customer's rating and returns the courier's new average.
       *
       * Upsert on the job, so a customer who changes their mind revises rather
       * than stacks — the primary key is what makes rating the same delivery
       * twice impossible rather than merely discouraged.
       *
       * The average is recomputed from the rows in the same statement batch,
       * rather than incremented on the rider. An incremented average drifts, and
       * cannot be corrected without the rows anyway; recomputing over an indexed
       * column costs one aggregate on a table with one row per delivery.
       */
      async record(rating: {
        jobId: string;
        riderId: string;
        customerEmail: string;
        stars: number;
        comment: string;
      }): Promise<{ average: number; count: number }> {
        await exec`
          insert into job_ratings (job_id, rider_id, customer_email, stars, comment)
          values (
            ${rating.jobId}, ${rating.riderId}, ${rating.customerEmail.toLowerCase()},
            ${rating.stars}, ${rating.comment}
          )
          on conflict (job_id) do update set
            stars      = excluded.stars,
            comment    = excluded.comment,
            created_at = now()
        `;

        const rows = await exec<{ average: number; count: number }[]>`
          select coalesce(avg(stars), 0)::double precision as average,
                 count(*)::int as count
          from job_ratings
          where rider_id = ${rating.riderId}
        `;

        const { average, count } = rows[0];

        await exec`
          update riders
          set rating = ${average}, rating_count = ${count}
          where id = ${rating.riderId}
        `;

        return { average, count };
      },

      /** This job's rating, so a customer can see what they left. */
      async find(jobId: string): Promise<{ stars: number; comment: string } | null> {
        const rows = await exec<{ stars: number; comment: string }[]>`
          select stars, comment from job_ratings where job_id = ${jobId}
        `;
        return rows[0] ?? null;
      },

      /**
       * A courier's ratings, newest first, for the desk.
       *
       * A number on its own tells a supervisor something is wrong and nothing
       * about what — the comments are the half that can be acted on.
       */
      async forRider(
        riderId: string,
        limit = 50
      ): Promise<{ jobId: string; stars: number; comment: string; createdAt: string }[]> {
        const rows = await exec<
          { job_id: string; stars: number; comment: string; created_at: string }[]
        >`
          select job_id, stars, comment, created_at
          from job_ratings
          where rider_id = ${riderId}
          order by created_at desc
          limit ${limit}
        `;
        return rows.map((row) => ({
          jobId: row.job_id,
          stars: row.stars,
          comment: row.comment,
          createdAt: new Date(row.created_at).toISOString(),
        }));
      },
    },

    // -----------------------------------------------------------------------
    // Riders
    // -----------------------------------------------------------------------
    riders: {
      async list(opts: { activeOnly?: boolean } = {}): Promise<StoredRider[]> {
        const rows = await exec<RiderRow[]>`
          select * from riders
          where ${opts.activeOnly ? exec`active` : exec`true`}
          order by id
        `;
        return rows.map(toRider);
      },

      async find(id: string): Promise<StoredRider | null> {
        const rows = await exec<RiderRow[]>`select * from riders where id = ${id}`;
        return rows[0] ? toRider(rows[0]) : null;
      },

      /**
       * Sign-in. The employee ID or the courier's own number resolves to the
       * same record — somebody who has forgotten the first has not forgotten
       * the second.
       */
      async findByIdentifier(identifier: string): Promise<StoredRider | null> {
        const key = phoneLookup(identifier);
        const rows = await exec<RiderRow[]>`
          select * from riders
          where lower(employee_id) = ${identifier.trim().toLowerCase()}
             or (${key}::text is not null and phone_key = ${key})
          limit 1
        `;
        return rows[0] ? toRider(rows[0]) : null;
      },

      /** Whether this number is already on the roster, however it was written. */
      async findByPhone(phone: string): Promise<StoredRider | null> {
        const key = phoneLookup(phone);
        if (!key) return null;
        const rows = await exec<RiderRow[]>`
          select * from riders where phone_key = ${key} limit 1
        `;
        return rows[0] ? toRider(rows[0]) : null;
      },

      async insert(rider: StoredRider): Promise<StoredRider> {
        // `distanceDate` is defaulted rather than required below: `import-json`
        // inserts records straight from a dump, and one written before ridden
        // distance carried a date has no stamp to give. An empty stamp reads as
        // "nothing ridden today", which is the truth about a figure nobody can
        // date.
        const rows = await exec<RiderRow[]>`
          insert into riders (
            id, employee_id, phone, name, avatar, vehicle, vehicle_plate,
            is_online, gps_accuracy, speed, heading, coords,
            rating, today_distance, distance_date, today_earnings, completed_count,
            on_time_rate, acceptance_rate, completion_rate,
            pin_salt, pin_hash, must_change_pin, pin_expires_at, active
          ) values (
            ${rider.id}, ${rider.employeeId}, ${rider.phone}, ${rider.name},
            ${rider.avatar}, ${rider.vehicle}, ${rider.vehiclePlate},
            ${rider.isOnline}, ${rider.gpsAccuracy},
            ${rider.speed}, ${rider.heading}, ${exec.json(rider.coords as never)},
            ${rider.rating}, ${rider.todayDistance}, ${rider.distanceDate ?? ''},
            ${rider.todayEarnings},
            ${rider.completedCount}, ${rider.onTimeRate}, ${rider.acceptanceRate},
            ${rider.completionRate}, ${rider.pinSalt ?? null}, ${rider.pinHash ?? null},
            ${rider.mustChangePin ?? false}, ${rider.pinExpiresAt ?? null},
            ${rider.active ?? true}
          )
          returning *
        `;
        return toRider(rows[0]);
      },

      async update(id: string, patch: RiderPatch): Promise<StoredRider | null> {
        const assignments = riderAssignments(patch);

        // Nothing to write. Reading the row back is what the caller wanted
        // anyway, and an empty SET clause is a syntax error.
        if (Object.keys(assignments).length === 0) {
          const rows = await exec<RiderRow[]>`select * from riders where id = ${id}`;
          return rows[0] ? toRider(rows[0]) : null;
        }

        const rows = await exec<RiderRow[]>`
          update riders set ${exec(assignments)} where id = ${id} returning *
        `;
        return rows[0] ? toRider(rows[0]) : null;
      },

      /**
       * Every id already taken, so a new courier can be given the next free
       * one. Both are short readable strings rather than UUIDs, which is worth
       * a query at provisioning time — it is not a hot path.
       */
      async takenIds(): Promise<{ ids: string[]; employeeIds: string[] }> {
        const rows = await exec<{ id: string; employee_id: string }[]>`
          select id, employee_id from riders
        `;
        return {
          ids: rows.map((row) => row.id),
          employeeIds: rows.map((row) => row.employee_id),
        };
      },

      async count(): Promise<number> {
        const rows = await exec<{ count: number }[]>`select count(*)::int as count from riders`;
        return rows[0].count;
      },
    },

    // -----------------------------------------------------------------------
    // Accounts
    // -----------------------------------------------------------------------
    accounts: {
      async list(): Promise<StoredAccount[]> {
        const rows = await exec<AccountRow[]>`select * from accounts order by created_at`;
        return rows.map(toAccount);
      },

      async find(email: string, opts: { lock?: boolean } = {}): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          select * from accounts where lower(email) = ${email.trim().toLowerCase()}
          ${opts.lock ? exec`for update` : exec``}
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /** Sign-in and registration both accept an email or a phone number. */
      async findByIdentifier(identifier: string): Promise<StoredAccount | null> {
        const key = phoneLookup(identifier);
        const rows = await exec<AccountRow[]>`
          select * from accounts
          where lower(email) = ${identifier.trim().toLowerCase()}
             or (${key}::text is not null and phone_key = ${key})
          limit 1
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Whether either half of a new registration already belongs to somebody.
       *
       * Ordered so an email match wins over a phone match. The array scan this
       * replaced returned whichever record happened to sit earlier, which is
       * not a rule anyone chose — and registration reads fields off the result,
       * so which one comes back is visible in the account that gets created.
       */
      async findByEmailOrPhone(email: string, phone: string): Promise<StoredAccount | null> {
        const wanted = email.trim().toLowerCase();
        const key = phoneLookup(phone);

        const rows = await exec<AccountRow[]>`
          select * from accounts
          where lower(email) = ${wanted}
             or (${key}::text is not null and phone_key = ${key})
          order by (lower(email) = ${wanted}) desc
          limit 1
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      async insert(account: StoredAccount): Promise<StoredAccount> {
        const rows = await exec<AccountRow[]>`
          insert into accounts (
            email, phone, name, created_at, points, wallet_balance,
            password_salt, password_hash, email_verified
          ) values (
            ${account.email}, ${account.phone}, ${account.name},
            ${account.createdAt}, ${account.points ?? null},
            ${account.walletBalance ?? null},
            ${account.passwordSalt ?? null}, ${account.passwordHash ?? null},
            ${account.emailVerified ?? false}
          )
          returning *
        `;
        return toAccount(rows[0]);
      },

      /**
       * Writes only the fields named. Credentials are not among them, and are
       * not reachable from here at all — `/api/accounts` is a profile route,
       * and a password is only ever set through `/api/auth/register`.
       */
      async updateProfile(
        email: string,
        patch: Partial<
          Pick<StoredAccount, 'email' | 'phone' | 'name' | 'points' | 'walletBalance' | 'addresses'>
        >
      ): Promise<StoredAccount | null> {
        const columns: Record<string, string> = {
          email: 'email',
          phone: 'phone',
          name: 'name',
          points: 'points',
          walletBalance: 'wallet_balance',
          addresses: 'addresses',
        };

        const assignments: Record<string, unknown> = {};
        for (const [field, column] of Object.entries(columns)) {
          const value = (patch as Record<string, unknown>)[field];
          if (value === undefined) continue;

          // `addresses` is jsonb, and the book arrives as a plain array. Handed
          // over as one it does not reach the column as json at all: postgres.js
          // infers a parameter type from the value, and for anything it does not
          // recognise — an array, an object — that inference lands on the number
          // handler, whose serialiser is `String(x)`. The column would be given
          // the text `[object Object]` and reject it. `json()` tags the
          // parameter so it is stringified properly, which is how the jsonb
          // columns in `upsertJob` above are written.
          assignments[column] = field === 'addresses' ? exec.json(value as never) : value;
        }

        if (Object.keys(assignments).length === 0) {
          return this.find(email);
        }

        const rows = await exec<AccountRow[]>`
          update accounts set ${exec(assignments)}
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Writes the membership, and optionally the wallet it is paid from.
       *
       * Deliberately not reachable from `updateProfile`: a plan is an
       * entitlement somebody paid for, so it is written here — by the plan
       * route, inside a transaction that also moves the money — and never by a
       * client PUTting an account body.
       *
       * `walletBalance` is optional because a cancellation changes the plan and
       * not the balance; when it is given, both land in the same statement so a
       * renewal can never take the fee without recording the period it bought.
       */
      async setPlan(
        email: string,
        plan: ActivePlan | null,
        walletBalance?: number
      ): Promise<StoredAccount | null> {
        const assignments: Record<string, unknown> = {
          plan_id: plan?.planId ?? null,
          plan_started_at: plan?.startedAt ?? null,
          plan_period_start: plan?.periodStart ?? null,
          plan_renews_on: plan?.renewsOn ?? null,
          plan_price: plan?.price ?? null,
          plan_pickups_used: plan?.pickupsUsed ?? 0,
          plan_cancel_at_end: plan?.cancelAtPeriodEnd ?? false,
        };

        if (walletBalance !== undefined) assignments.wallet_balance = walletBalance;

        const rows = await exec<AccountRow[]>`
          update accounts set ${exec(assignments)}
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Records an outstanding confirmation link.
       *
       * Replaces whatever was there, so asking for a second link retires the
       * first — two live links for one address means a customer confirming with
       * the older mail in their inbox, which works but is impossible to reason
       * about when it does not.
       */
      async setVerificationToken(
        email: string,
        token: { hash: string; expiresAt: string; sentAt: string }
      ): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            verification_token_hash = ${token.hash},
            verification_expires_at = ${token.expiresAt},
            verification_sent_at    = ${token.sentAt}
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * The account holding this link, if the link is still live.
       *
       * Expiry is part of the where-clause rather than a check on the result:
       * an expired token should not resolve to an account at all, and doing it
       * here means no caller can forget.
       */
      async findByVerificationToken(hash: string): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          select * from accounts
          where verification_token_hash = ${hash}
            and verification_expires_at > now()
          limit 1
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Confirms the address and spends the link in one statement.
       *
       * Clearing the token is what stops a confirmation URL — which lives in
       * browser history and in the customer's inbox indefinitely — from being
       * replayable afterwards.
       */
      async markEmailVerified(email: string): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            email_verified          = true,
            verification_token_hash = null,
            verification_expires_at = null
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Records an outstanding reset link.
       *
       * Overwrites any previous one, so asking twice leaves exactly one live
       * link — the newest. The older email still opens, but its token no longer
       * matches anything.
       */
      async setResetToken(
        email: string,
        token: { hash: string; expiresAt: string; sentAt: string }
      ): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            reset_token_hash = ${token.hash},
            reset_expires_at = ${token.expiresAt},
            reset_sent_at    = ${token.sentAt}
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * The account holding this reset link, if the link is still live.
       *
       * Expiry is in the where-clause rather than checked on the result, for
       * the reason `findByVerificationToken` does it that way: an expired token
       * should not resolve to an account at all, and no caller can forget.
       */
      async findByResetToken(hash: string): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          select * from accounts
          where reset_token_hash = ${hash}
            and reset_expires_at > now()
          limit 1
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Spends the reset link.
       *
       * `reset_sent_at` is deliberately left alone: it is the rate limit, and
       * clearing it here would let somebody complete a reset and immediately
       * request another mail, which is the loop the cooldown exists to close.
       */
      async clearResetToken(email: string): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            reset_token_hash = null,
            reset_expires_at = null
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /** Sets or replaces the password on an existing account. */
      async setPassword(
        email: string,
        credentials: { salt: string; hash: string; name?: string; phone?: string }
      ): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            password_salt = ${credentials.salt},
            password_hash = ${credentials.hash},
            name  = coalesce(${credentials.name ?? null}, name),
            phone = coalesce(${credentials.phone ?? null}, phone)
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Suspends a customer, or lifts the suspension.
       *
       * Both columns move together, so lifting a block cannot leave last
       * month's reason attached to an account in good standing. Not reachable
       * from `updateProfile`, for the reason the plan is not: this is a
       * supervisor's decision about a customer, never something a customer's
       * own profile PUT can write about themselves.
       */
      async setBlocked(
        email: string,
        blocked: { at: string; reason: string } | null
      ): Promise<StoredAccount | null> {
        const rows = await exec<AccountRow[]>`
          update accounts set
            blocked_at     = ${blocked?.at ?? null},
            blocked_reason = ${blocked?.reason || null}
          where lower(email) = ${email.trim().toLowerCase()}
          returning *
        `;
        return rows[0] ? toAccount(rows[0]) : null;
      },

      /**
       * Erases the account.
       *
       * Their jobs stay. Nothing references this table — a job carries its own
       * copy of the customer's name, phone and address inside `jobs.customer`,
       * and `transactions.user_email` is a label rather than a foreign key — so
       * the ledger reads exactly as it did, and the identity behind it is gone.
       */
      async remove(email: string): Promise<boolean> {
        const result = await exec`
          delete from accounts where lower(email) = ${email.trim().toLowerCase()}
        `;
        return result.count > 0;
      },
    },

    // -----------------------------------------------------------------------
    // Supervisors
    // -----------------------------------------------------------------------
    supervisors: {
      async list(): Promise<StoredSupervisor[]> {
        const rows = await exec<SupervisorRow[]>`select * from supervisors order by id`;
        return rows.map(toSupervisor);
      },

      async findByEmail(email: string): Promise<StoredSupervisor | null> {
        const rows = await exec<SupervisorRow[]>`
          select * from supervisors where lower(email) = ${email.trim().toLowerCase()}
        `;
        return rows[0] ? toSupervisor(rows[0]) : null;
      },

      async insert(supervisor: StoredSupervisor): Promise<StoredSupervisor> {
        const rows = await exec<SupervisorRow[]>`
          insert into supervisors (id, name, email, created_at, active, password_salt, password_hash)
          values (
            ${supervisor.id}, ${supervisor.name}, ${supervisor.email},
            ${supervisor.createdAt}, ${supervisor.active ?? true},
            ${supervisor.passwordSalt ?? null}, ${supervisor.passwordHash ?? null}
          )
          returning *
        `;
        return toSupervisor(rows[0]);
      },
    },

    // -----------------------------------------------------------------------
    // Messaging
    // -----------------------------------------------------------------------
    messages: {
      /**
       * Ordered by insertion, not by `timestamp` — that field holds a display
       * label like "14:32" produced by `nowLabel()`, which cannot order a
       * conversation that runs past midnight.
       */
      async list(orderId?: string | null): Promise<Message[]> {
        const rows = await exec<MessageRow[]>`
          select * from messages
          where ${orderId ? exec`order_id = ${orderId}` : exec`true`}
          order by seq
        `;
        return rows.map(toMessage);
      },

      /**
       * The newest `limit` messages across every thread, in conversation order.
       *
       * For the desk's inbox, which reads all threads at once. `list(null)` would
       * answer the same rows and never stop growing — this table gets a line for
       * every status change on every job — so the desk takes a page of the most
       * recent traffic, oldest-first within that page so a thread reads downwards
       * the way it was written.
       */
      async listRecent(limit: number): Promise<Message[]> {
        const rows = await exec<MessageRow[]>`
          select * from (
            select * from messages order by seq desc limit ${limit}
          ) recent
          order by seq
        `;
        return rows.map(toMessage);
      },

      async insert(message: Message): Promise<Message> {
        const rows = await exec<MessageRow[]>`
          insert into messages (id, sender, "text", "timestamp", order_id)
          values (
            ${message.id}, ${message.sender}, ${message.text},
            ${message.timestamp}, ${message.orderId ?? null}
          )
          on conflict (id) do nothing
          returning *
        `;
        // A replayed id is not an error — the offline queues in both clients
        // resend, and the message already recorded is the right answer.
        return rows[0] ? toMessage(rows[0]) : message;
      },
    },

    notifications: {
      async list(): Promise<Notification[]> {
        const rows = await exec<NotificationRow[]>`
          select * from notifications order by seq desc
        `;
        return rows.map(toNotification);
      },

      async insert(notification: Notification): Promise<Notification> {
        const rows = await exec<NotificationRow[]>`
          insert into notifications (id, title, body, "timestamp", "type", order_id, "read")
          values (
            ${notification.id}, ${notification.title}, ${notification.body},
            ${notification.timestamp}, ${notification.type},
            ${notification.orderId ?? null}, ${notification.read}
          )
          on conflict (id) do nothing
          returning *
        `;
        return rows[0] ? toNotification(rows[0]) : notification;
      },

      async markRead(id: string): Promise<Notification | null> {
        const rows = await exec<NotificationRow[]>`
          update notifications set "read" = true where id = ${id} returning *
        `;
        return rows[0] ? toNotification(rows[0]) : null;
      },
    },

    // -----------------------------------------------------------------------
    // Payments
    // -----------------------------------------------------------------------
    transactions: {
      async list(email?: string | null): Promise<PaymentTransaction[]> {
        const rows = await exec<TransactionRow[]>`
          select * from transactions
          where ${email ? exec`lower(user_email) = ${email.toLowerCase()}` : exec`true`}
          order by seq desc
        `;
        return rows.map(toTransaction);
      },

      /**
       * One entry by its reference, or null.
       *
       * The wallet routes use this to make a movement idempotent: both apps
       * queue their writes offline and replay them, and an upsert alone would
       * dedupe the ledger row while the balance moved a second time. Finding
       * the reference first is what makes a replayed top-up a no-op instead of
       * free money.
       */
      async findByReference(reference: string): Promise<PaymentTransaction | null> {
        const rows = await exec<TransactionRow[]>`
          select * from transactions where reference = ${reference} limit 1
        `;
        return rows[0] ? toTransaction(rows[0]) : null;
      },

      /** Matched on `reference` — what Paystack echoes back on a verify. */
      async upsert(transaction: PaymentTransaction): Promise<PaymentTransaction> {
        const rows = await exec<TransactionRow[]>`
          insert into transactions (
            id, reference, booking_id, user_email, amount, method,
            status, "timestamp", description
          ) values (
            ${transaction.id}, ${transaction.reference}, ${transaction.bookingId ?? null},
            ${transaction.userEmail ?? null}, ${transaction.amount}, ${transaction.method},
            ${transaction.status}, ${transaction.timestamp}, ${transaction.description}
          )
          on conflict (reference) do update set
            booking_id  = excluded.booking_id,
            user_email  = excluded.user_email,
            amount      = excluded.amount,
            method      = excluded.method,
            status      = excluded.status,
            "timestamp" = excluded."timestamp",
            description = excluded.description
          returning *
        `;
        return toTransaction(rows[0]);
      },
    },

    // -----------------------------------------------------------------------
    // Audit trail
    // -----------------------------------------------------------------------
    auditEvents: {
      /**
       * Append one entry.
       *
       * `created_at` is left to the column default so the instant comes from
       * the database clock rather than from whichever process happened to
       * handle the request. `on conflict do nothing` is a belt-and-braces
       * measure against a retried write — nothing here is meant to be replayed,
       * and an audit row must never be rewritten.
       */
      async insert(event: Omit<AuditEvent, 'at'>): Promise<AuditEvent> {
        const rows = await exec<AuditEventRow[]>`
          insert into audit_events (
            id, actor, actor_name, action, details, "type", order_id, subject
          ) values (
            ${event.id}, ${event.actor}, ${event.actorName}, ${event.action},
            ${event.details}, ${event.type}, ${event.orderId ?? null},
            ${event.subject ?? null}
          )
          on conflict (id) do nothing
          returning *
        `;
        return rows[0]
          ? toAuditEvent(rows[0])
          : { ...event, at: new Date().toISOString() };
      },

      /** Newest first. Nothing is ever pruned, so the caller sets the page. */
      async list(limit: number): Promise<AuditEvent[]> {
        const rows = await exec<AuditEventRow[]>`
          select * from audit_events order by seq desc limit ${limit}
        `;
        return rows.map(toAuditEvent);
      },
    },

    // -----------------------------------------------------------------------
    // Sessions
    // -----------------------------------------------------------------------
    sessions: {
      async insert(session: StoredSession): Promise<StoredSession> {
        const rows = await exec<SessionRow[]>`
          insert into sessions (token, kind, subject, created_at, expires_at)
          values (
            ${session.token}, ${session.kind}, ${session.subject},
            ${session.createdAt}, ${session.expiresAt}
          )
          returning *
        `;
        return toSession(rows[0]);
      },

      /**
       * The live session behind a token. Expired ones are deleted on sight and
       * reported as absent, so the sweep costs nothing on its own schedule.
       */
      async findLive(token: string, kind: SessionKind): Promise<StoredSession | null> {
        const rows = await exec<SessionRow[]>`
          select * from sessions
          where token = ${token} and kind = ${kind} and expires_at > now()
        `;
        return rows[0] ? toSession(rows[0]) : null;
      },

      async revoke(token: string): Promise<void> {
        await exec`delete from sessions where token = ${token}`;
      },

      /**
       * Signs one subject out everywhere.
       *
       * What a completed password reset calls. Whoever knew the old password
       * may still be holding a week-long bearer token, and leaving those alive
       * would mean the reset changed the lock while the other key still turned
       * it — which is precisely the case a reset exists for.
       */
      async revokeAllFor(kind: SessionKind, subject: string): Promise<void> {
        await exec`
          delete from sessions
          where kind = ${kind}
            and subject = ${kind === 'rider' ? subject : subject.toLowerCase()}
        `;
      },

      /** Clears expired tokens. Called when a new one is issued. */
      async pruneExpired(): Promise<void> {
        await exec`delete from sessions where expires_at <= now()`;
      },
    },

    // -----------------------------------------------------------------------
    // Setup links
    // -----------------------------------------------------------------------
    setupTokens: {
      /**
       * Issues the link for a booking, retiring any earlier one for it.
       *
       * One live link per booking: a customer who asks for another should not
       * leave the first one working, and the newest mail in the inbox is the
       * one they will open.
       */
      async issue(token: StoredSetupToken): Promise<StoredSetupToken> {
        await exec`delete from booking_setup_tokens where booking_id = ${token.bookingId}`;

        const rows = await exec<SetupTokenRow[]>`
          insert into booking_setup_tokens (token_hash, booking_id, email, created_at, expires_at)
          values (
            ${token.tokenHash}, ${token.bookingId}, ${token.email},
            ${token.createdAt}, ${token.expiresAt}
          )
          returning *
        `;
        return toSetupToken(rows[0]);
      },

      /**
       * The outstanding link for a booking, if there is one.
       *
       * Only its clock is of any use to a caller — the digest cannot be turned
       * back into the token in the email. It is what rate-limits "send me
       * another one".
       */
      async findForBooking(bookingId: string): Promise<StoredSetupToken | null> {
        const rows = await exec<SetupTokenRow[]>`
          select * from booking_setup_tokens
          where booking_id = ${bookingId} and expires_at > now()
        `;
        return rows[0] ? toSetupToken(rows[0]) : null;
      },

      /**
       * The link behind a digest, if it is still good.
       *
       * A read, for the screen that draws the booking before anyone types a
       * password. It does not spend the link — `spend` does, and that is the
       * one the claim runs.
       */
      async findLive(tokenHash: string): Promise<StoredSetupToken | null> {
        const rows = await exec<SetupTokenRow[]>`
          select * from booking_setup_tokens
          where token_hash = ${tokenHash} and expires_at > now()
        `;
        return rows[0] ? toSetupToken(rows[0]) : null;
      },

      /**
       * Uses a link up, and says whether it was there to use.
       *
       * Delete-and-return in one statement on purpose: this is what makes a
       * setup link single-use under concurrency. Two tabs submitting the same
       * link both reach this, Postgres serialises them on the row, and the
       * second gets nothing back rather than a second account.
       */
      async spend(tokenHash: string): Promise<StoredSetupToken | null> {
        const rows = await exec<SetupTokenRow[]>`
          delete from booking_setup_tokens
          where token_hash = ${tokenHash} and expires_at > now()
          returning *
        `;
        return rows[0] ? toSetupToken(rows[0]) : null;
      },

      /** Clears dead links. Called when a new one is issued. */
      async pruneExpired(): Promise<void> {
        await exec`delete from booking_setup_tokens where expires_at <= now()`;
      },
    },

    // -----------------------------------------------------------------------
    // Tracking tokens
    // -----------------------------------------------------------------------
    trackingTokens: {
      /**
       * Issues the token for a booking, retiring any earlier one.
       *
       * One live token per booking. The web app's offline queue re-POSTs a
       * booking whose first attempt never answered, so the client holding the
       * reply is by definition holding the newest one — an older digest is a
       * grant nobody can present.
       */
      async issue(token: StoredTrackingToken): Promise<StoredTrackingToken> {
        await exec`delete from booking_tracking_tokens where booking_id = ${token.bookingId}`;

        const rows = await exec<TrackingTokenRow[]>`
          insert into booking_tracking_tokens (token_hash, booking_id, created_at, expires_at)
          values (
            ${token.tokenHash}, ${token.bookingId},
            ${token.createdAt}, ${token.expiresAt}
          )
          returning *
        `;
        return toTrackingToken(rows[0]);
      },

      /**
       * The booking a token grants, if the grant is still live.
       *
       * Expiry is in the where-clause rather than checked on the result, for the
       * reason the other token lookups do it that way: an expired grant should
       * not resolve to a booking at all, and no caller can forget.
       */
      async findLive(tokenHash: string): Promise<StoredTrackingToken | null> {
        const rows = await exec<TrackingTokenRow[]>`
          select * from booking_tracking_tokens
          where token_hash = ${tokenHash} and expires_at > now()
        `;
        return rows[0] ? toTrackingToken(rows[0]) : null;
      },

      /** Clears dead tokens. Called when a new one is issued. */
      async pruneExpired(): Promise<void> {
        await exec`delete from booking_tracking_tokens where expires_at <= now()`;
      },
    },
  };
}

/** Every repository, bound to one executor. */
export type Repositories = ReturnType<typeof repositories>;

export const store = {
  ...repositories(sql),

  /**
   * Runs several writes as one.
   *
   * Anything that touches more than one table belongs in here — a delivery
   * completing writes the job, a message, a notification and the courier's
   * totals, and three of those landing without the fourth is a worse record
   * than none of them landing.
   */
  async tx<T>(fn: (t: Repositories) => Promise<T>): Promise<T> {
    return (await sql.begin((transaction) => fn(repositories(transaction)))) as T;
  },

  /**
   * Wipes every table back to nothing — the admin dashboard's "reset".
   *
   * `truncate ... cascade` rather than nine deletes so the foreign keys from
   * messages and notifications back to jobs do not have to be untangled in
   * order, and the sequences behind `seq` restart with the data.
   *
   * The audit trail goes with it, which is the one place that is defensible:
   * this route refuses in production, and audit rows describing jobs and
   * patrons that no longer exist are worse than no rows at all.
   */
  async reset(): Promise<void> {
    await sql`
      truncate jobs, riders, accounts, supervisors, messages,
               notifications, transactions, sessions, audit_events
      restart identity cascade
    `;
  },
};
