/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Job,
  Message,
  Notification,
  PaymentTransaction,
  RiderState,
  UserAccount,
} from '@freshfold/core';
import type { StoredSession } from './auth';
import {
  seedAccounts,
  seedJobs,
  seedMessages,
  seedNotifications,
  seedRiders,
} from './seed';

/**
 * A JSON file standing in for a database.
 *
 * Small enough to hold in memory, written back on a short debounce so a burst
 * of rider status updates costs one write instead of ten. Swapping this for
 * Postgres or SQLite later means reimplementing `read`/`mutate` and nothing
 * else — no route touches the filesystem directly.
 */

/**
 * An account as it exists at rest, with its credentials.
 *
 * This type stays inside the server. `sanitize` in `./auth` converts it to the
 * `UserAccount` clients receive, which has no credential fields at all.
 */
export type StoredAccount = UserAccount & {
  passwordSalt?: string;
  passwordHash?: string;
};

export interface Database {
  jobs: Job[];
  riders: RiderState[];
  messages: Message[];
  notifications: Notification[];
  accounts: StoredAccount[];
  transactions: PaymentTransaction[];
  sessions: StoredSession[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(HERE, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SAVE_DEBOUNCE_MS = 250;

function emptyDatabase(): Database {
  return {
    jobs: [],
    riders: [],
    messages: [],
    notifications: [],
    accounts: [],
    transactions: [],
    sessions: [],
  };
}

export function freshDatabase(): Database {
  return {
    jobs: seedJobs(),
    riders: seedRiders(),
    messages: seedMessages(),
    notifications: seedNotifications(),
    accounts: seedAccounts(),
    transactions: [],
    sessions: [],
  };
}

function load(): Database {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Database>;
    // Merge over an empty shape so a file written by an older build that
    // predates a collection still loads instead of crashing on undefined.
    return { ...emptyDatabase(), ...parsed };
  } catch {
    const seeded = freshDatabase();
    persist(seeded);
    return seeded;
  }
}

function persist(data: Database): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[store] failed to persist database:', error);
  }
}

let db: Database = load();
let saveTimer: NodeJS.Timeout | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist(db);
  }, SAVE_DEBOUNCE_MS);
}

export const store = {
  /** Read-only snapshot. Callers must not mutate what they get back. */
  read(): Readonly<Database> {
    return db;
  },

  /** The only way to change anything. Returns whatever the mutator returns. */
  mutate<T>(fn: (data: Database) => T): T {
    const result = fn(db);
    scheduleSave();
    return result;
  },

  /** Wipe back to seed data — the admin dashboard's "reset" action. */
  reset(): void {
    db = freshDatabase();
    persist(db);
  },

  /** Flush pending writes; called on shutdown. */
  flush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    persist(db);
  },

  get file(): string {
    return DB_FILE;
  },
};
