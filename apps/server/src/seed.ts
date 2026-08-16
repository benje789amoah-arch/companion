/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hashPassword } from './passwords';
import { store, type StoredAccount, type StoredRider, type StoredSupervisor } from './store';

/**
 * What a fresh database contains.
 *
 * Deliberately almost nothing. There are no demo jobs: every order in the
 * system is one somebody actually booked, on the website or in the customer
 * app, so the rider's board and the supervisor's ledger only ever show real
 * work. A fresh install opens on empty states, which is correct — there is no
 * work yet.
 *
 * What does exist is identity, because nobody can sign in to a system with no
 * accounts in it, and none of these three can be self-registered:
 *
 *  - **The courier roster.** Employment records: an id, an employee number, a
 *    contact number and a hashed PIN. Name, vehicle and plate are blank until
 *    the courier enters them, and every performance figure starts at zero
 *    rather than inventing a flattering one.
 *
 *  - **A supervisor.** The bootstrap desk account. Somebody has to be able to
 *    sign in and put the first courier on the roster.
 *
 *  - **Sign-in accounts.** Without these there is no way into the customer app
 *    except registering a new account first. They carry an identity and a
 *    password and nothing else: no points, no wallet balance, no history.
 *
 * Seeding is per-table and only fires on an empty one, so restarting the server
 * against a database that already has a roster does nothing at all. It is not
 * an "insert if absent" over each record: a supervisor who deactivated a
 * courier does not want them back on the next deploy.
 */

/**
 * The courier roster.
 *
 * Riders are provisioned by the company, never self-registered, so these are
 * employment records rather than sample data: an id, an employee number, a
 * contact number, a PIN, and the company vehicle they have been given. The one
 * thing a courier enters themselves is their own name, and dispatch will not
 * let them accept work until they have.
 *
 * Every performance figure starts at zero. Nobody has driven anywhere yet.
 */
const ROSTER = [
  {
    id: 'FF-R-204',
    employeeId: 'RIDER-204',
    phone: '0244567801',
    pin: '7801',
    vehicle: 'Electric delivery scooter',
    vehiclePlate: 'AS-3012-26',
  },
  {
    id: 'FF-R-118',
    employeeId: 'RIDER-118',
    phone: '0209114402',
    pin: '4019',
    vehicle: 'Electric delivery scooter',
    vehiclePlate: 'AS-2884-25',
  },
  {
    id: 'FF-R-337',
    employeeId: 'RIDER-337',
    phone: '0553370915',
    pin: '1234',
    vehicle: 'Cargo tricycle',
    vehiclePlate: 'AS-4471-24',
  },
];

/**
 * Sign-in accounts, all with the password `password` — hashed on the way in,
 * like any other account. There is no plaintext credential in the database.
 *
 * These exist so there is a door into the customer app on a fresh install.
 * They start with no points, no wallet and no orders; everything a real
 * account accumulates, it accumulates by being used.
 */
const SIGN_IN_ACCOUNTS = [
  { name: 'Ama Serwaah', email: 'ama.serwaah@st.knust.edu.gh', phone: '0550192831' },
  { name: 'Kofi Mensah', email: 'kofi.mensah@gmail.com', phone: '0240419844' },
  { name: 'Adwoa Osei', email: 'adwoa.osei@outlook.com', phone: '0500887261' },
];

/** Every seeded staff and sign-in credential uses this. */
export const DEMO_PASSWORD = 'password';

/**
 * The supervisor desk.
 *
 * One account to start, because somebody has to be able to sign in and put the
 * first courier on the roster. Supervisors are not self-registered either —
 * this is the bootstrap identity, and further ones would be created by an
 * existing supervisor.
 */
const SUPERVISORS = [
  { id: 'FF-S-001', name: 'Concierge Desk Supervisor', email: 'supervisor@freshfold.com' },
];

export function seedRiders(): StoredRider[] {
  return ROSTER.map(({ id, employeeId, phone, pin, vehicle, vehiclePlate }) => {
    const { salt, hash } = hashPassword(pin);
    return {
      id,
      employeeId,
      phone,
      // The courier's own, entered on first sign-in. Dispatch refuses to let
      // them accept work until it has a value.
      name: '',
      avatar: '',
      // The company's, assigned with the employment record.
      vehicle,
      vehiclePlate,
      // Nothing has been rated, driven or delivered yet. Zero says that;
      // a 5.0 rating and a 96.5% acceptance rate would be a claim.
      rating: 0,
      isOnline: false,
      batteryLevel: 100,
      gpsAccuracy: 0,
      speed: 0,
      heading: 0,
      // Parked at the hub until the device reports a real fix.
      coords: { lat: 6.6852, lng: -1.5815 },
      todayDistance: 0,
      todayEarnings: 0,
      completedCount: 0,
      onTimeRate: 0,
      acceptanceRate: 0,
      completionRate: 0,
      active: true,
      pinSalt: salt,
      pinHash: hash,
    };
  });
}

export function seedSupervisors(): StoredSupervisor[] {
  return SUPERVISORS.map((supervisor) => {
    const { salt, hash } = hashPassword(DEMO_PASSWORD);
    return {
      ...supervisor,
      createdAt: new Date().toISOString(),
      active: true,
      passwordSalt: salt,
      passwordHash: hash,
    };
  });
}

export function seedAccounts(): StoredAccount[] {
  return SIGN_IN_ACCOUNTS.map((account) => {
    const { salt, hash } = hashPassword(DEMO_PASSWORD);
    return {
      ...account,
      points: 0,
      walletBalance: 0,
      createdAt: new Date().toISOString(),
      passwordSalt: salt,
      passwordHash: hash,
      // Confirmed on the way in. These exist so a fresh install has a door into
      // the customer app; one that cannot book until somebody reads a mailbox
      // nobody owns is not a door.
      emailVerified: true,
    };
  });
}

/**
 * Puts the three bootstrap identities in place if they are not there already.
 *
 * Runs on every boot and on `POST /api/reset`. All three checks share one
 * transaction so two instances starting together cannot both find an empty
 * roster and both fill it — the second waits, sees three couriers, and does
 * nothing.
 */
export async function ensureSeeded(): Promise<{
  riders: number;
  supervisors: number;
  accounts: number;
}> {
  return store.tx(async (t) => {
    const inserted = { riders: 0, supervisors: 0, accounts: 0 };

    if ((await t.riders.count()) === 0) {
      for (const rider of seedRiders()) await t.riders.insert(rider);
      inserted.riders = ROSTER.length;
    }

    if ((await t.supervisors.list()).length === 0) {
      for (const supervisor of seedSupervisors()) await t.supervisors.insert(supervisor);
      inserted.supervisors = SUPERVISORS.length;
    }

    if ((await t.accounts.list()).length === 0) {
      for (const account of seedAccounts()) await t.accounts.insert(account);
      inserted.accounts = SIGN_IN_ACCOUNTS.length;
    }

    return inserted;
  });
}
