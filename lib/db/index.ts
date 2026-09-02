import { AsyncLocalStorage } from "node:async_hooks";
import { Pool as NeonPool, type PoolClient as NeonClient } from "@neondatabase/serverless";
import { Pool as PgPool, type PoolClient as PgClient } from "pg";

// The database driver. One pool per server instance: node-postgres against a
// local Postgres, Neon's serverless driver everywhere else. Queries use `?`
// placeholders, which are rewritten to `$1`, `$2`, ... before they run, so a
// literal `?` cannot appear in SQL text; pass it as a parameter instead.

export type SqlValue = string | number | null | bigint | boolean;

type DbPool = NeonPool | PgPool;
type DbClient = NeonClient | PgClient;
type Queryable = {
  query: (sql: string, params?: SqlValue[]) => Promise<{ rows: unknown[] }>;
};
type QueryResult = { rows: Record<string, unknown>[] };

// The client a transaction runs on, plus the tail of its query queue. A
// connection handles one statement at a time, so queries issued together
// inside a transaction (a Promise.all) wait their turn instead of racing.
type Transaction = { client: DbClient; tail: Promise<unknown> };

const txStore = new AsyncLocalStorage<Transaction>();

// Set while the schema and catalog bootstrap runs, so the queries it issues
// skip the readiness gate instead of waiting on themselves.
const bootStore = new AsyncLocalStorage<true>();

const globalForDb = globalThis as typeof globalThis & {
  __tradevictionPool?: DbPool;
  __tradevictionReady?: Promise<void>;
};

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  url.searchParams.delete("channel_binding");
  if (!isLocalHost(url.hostname) && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

function getPool(): DbPool {
  if (!globalForDb.__tradevictionPool) {
    const connectionString = databaseUrl();
    const host = new URL(connectionString).hostname;
    globalForDb.__tradevictionPool = isLocalHost(host)
      ? new PgPool({ connectionString })
      : new NeonPool({ connectionString });
  }
  return globalForDb.__tradevictionPool;
}

// Forgets that the bootstrap ran, so the next query checks the version
// markers again as a fresh server instance would. For tests.
export function forgetBootstrap(): void {
  globalForDb.__tradevictionReady = undefined;
}

// Closes the pool and forgets the bootstrap, so the next query starts over.
// Tests call it between databases; the app never does.
export async function closePool(): Promise<void> {
  await globalForDb.__tradevictionPool?.end();
  globalForDb.__tradevictionPool = undefined;
  forgetBootstrap();
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function serialized(tx: Transaction, sql: string, params: SqlValue[]): Promise<QueryResult> {
  const q = tx.client as unknown as Queryable;
  const next = tx.tail.then(
    () => q.query(sql, params),
    () => q.query(sql, params),
  );
  tx.tail = next.catch(() => undefined);
  return next.then((result) => ({ rows: result.rows as Record<string, unknown>[] }));
}

async function query(sql: string, params: SqlValue[] = []): Promise<QueryResult> {
  const tx = txStore.getStore();
  if (tx) return serialized(tx, sql, params);
  const result = await (getPool() as unknown as Queryable).query(sql, params);
  return { rows: result.rows as Record<string, unknown>[] };
}

// One version check per server instance. The full schema replay and catalog
// seed only run when the stored versions differ from the code.
async function ensureReady(): Promise<void> {
  if (bootStore.getStore()) return;
  if (!globalForDb.__tradevictionReady) {
    globalForDb.__tradevictionReady = bootStore
      .run(true, async () => {
        const { bootstrap } = await import("@/lib/db/bootstrap");
        await bootstrap();
      })
      .catch((error: unknown) => {
        globalForDb.__tradevictionReady = undefined;
        throw error;
      });
  }
  await globalForDb.__tradevictionReady;
}

async function exec(sql: string, params: SqlValue[]): Promise<QueryResult> {
  await ensureReady();
  return query(toPg(sql), params);
}

export async function run(sql: string, params: SqlValue[] = []): Promise<void> {
  await exec(sql, params);
}

export async function getRow(sql: string, params: SqlValue[] = []): Promise<Record<string, unknown> | undefined> {
  const result = await exec(sql, params);
  return result.rows[0];
}

export async function allRows(sql: string, params: SqlValue[] = []): Promise<Record<string, unknown>[]> {
  const result = await exec(sql, params);
  return result.rows;
}

// Runs fn inside one transaction. Nested calls join the transaction already
// open on this async context rather than starting another.
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await ensureReady();
  if (txStore.getStore()) return fn();
  const client = await getPool().connect();
  const tx: Transaction = { client, tail: Promise.resolve() };
  const q = client as unknown as Queryable;
  try {
    await q.query("BEGIN");
    const result = await txStore.run(tx, fn);
    await tx.tail;
    await q.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await tx.tail;
      await q.query("ROLLBACK");
    } catch {
      /* ignore rollback failure after a dead connection */
    }
    throw error;
  } finally {
    client.release();
  }
}
