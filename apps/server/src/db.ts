/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import postgres from 'postgres';

/**
 * The connection to Supabase Postgres.
 *
 * `dotenv.config()` runs here rather than only in `index.ts` because ES module
 * imports are evaluated before any statement in the importing module. A
 * `dotenv.config()` call sitting below the import list in `index.ts` would run
 * *after* this file had already read `process.env`, so the connection string
 * would always look unset. Calling it here makes the module self-sufficient:
 * it works the same whether it is reached through the server, a seed script or
 * a one-off `tsx` invocation. It never overwrites a variable that is already
 * set, so a real environment still wins over the file.
 */
dotenv.config();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Copy apps/server/.env.example to apps/server/.env and ' +
      'paste your Supabase connection string into it — Supabase dashboard → ' +
      'Project Settings → Database → Connection string → URI.'
  );
}

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

export const sql = postgres(url, {
  /**
   * Supabase terminates TLS at the connection, and refuses plaintext. `require`
   * rather than `verify-full` because Supabase serves a certificate signed by
   * its own CA, which is not in Node's trust store — verifying it would need
   * the CA bundle downloaded and shipped alongside the server.
   */
  ssl: isLocal ? false : 'require',

  /**
   * Prepared statements off.
   *
   * Supabase's pooled connection string (port 6543, Supavisor in transaction
   * mode) hands a different backend connection to each statement, so a
   * prepared statement created by one query is not there for the next and the
   * pooler reports it as missing. Direct connections on 5432 do not need this,
   * but leaving it off costs a plan cache rather than correctness, and it means
   * the same build works against either string.
   */
  prepare: false,

  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idle_timeout: 20,
  connect_timeout: 10,

  /**
   * `timestamptz` comes back as a JS `Date`; the domain model speaks ISO
   * strings everywhere (`Job.createdAt`, `StoredSession.expiresAt`). Converting
   * at the boundary means no route has to remember which it is holding.
   */
  types: {
    date: {
      to: 1184,
      from: [1082, 1114, 1184],
      serialize: (value: Date | string) =>
        typeof value === 'string' ? value : value.toISOString(),
      parse: (value: string) => new Date(value).toISOString(),
    },
  },
});

/**
 * Anything a query can run against — the pool, or a transaction handle.
 *
 * Every repository function in `./store` takes one of these, so the same
 * function body serves a standalone call and a step inside `store.tx()`
 * without a second copy that differs only in what it was passed.
 */
export type Executor = postgres.Sql | postgres.TransactionSql;

/** Whether the database is reachable. Backs `/api/health`. */
export async function ping(): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch (error) {
    console.error('[db] ping failed:', error);
    return false;
  }
}

/** Closes the pool on shutdown, letting in-flight queries finish first. */
export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
