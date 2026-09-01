import { AsyncLocalStorage } from "node:async_hooks";
import { Pool as NeonPool, type PoolClient as NeonClient } from "@neondatabase/serverless";
import { Pool as PgPool, type PoolClient as PgClient } from "pg";
import { SCHEMA } from "@/lib/db/schema";
import { migrate } from "@/lib/db/migrate";

export type SqlValue = string | number | null | bigint | boolean;

type DbPool = NeonPool | PgPool;
type DbClient = NeonClient | PgClient;
type Queryable = {
  query: (sql: string, params?: SqlValue[]) => Promise<{ rows: unknown[] }>;
};
type QueryResult = { rows: Record<string, unknown>[] };

const txStore = new AsyncLocalStorage<DbClient>();

const globalForDb = globalThis as typeof globalThis & {
  __losPool?: DbPool;
  __losReady?: Promise<void>;
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
  if (!globalForDb.__losPool) {
    const connectionString = databaseUrl();
    const host = new URL(connectionString).hostname;
    globalForDb.__losPool = isLocalHost(host)
      ? new PgPool({ connectionString })
      : new NeonPool({ connectionString });
  }
  return globalForDb.__losPool;
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function query(sql: string, params: SqlValue[] = []): Promise<QueryResult> {
  const target = (txStore.getStore() ?? getPool()) as unknown as Queryable;
  const result = await target.query(sql, params);
  return { rows: result.rows as Record<string, unknown>[] };
}

async function rawQuery(sql: string, params: SqlValue[] = []): Promise<QueryResult> {
  return query(toPg(sql), params);
}

async function applySchema(): Promise<void> {
  const statements = SCHEMA.split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await (getPool() as unknown as Queryable).query(statement);
  }
}

async function ensureReady(): Promise<void> {
  if (!globalForDb.__losReady) {
    globalForDb.__losReady = (async () => {
      await applySchema();
      await migrate(rawQuery);
    })().catch((error: unknown) => {
      globalForDb.__losReady = undefined;
      throw error;
    });
  }
  await globalForDb.__losReady;
}

async function exec(sql: string, params: SqlValue[]): Promise<QueryResult> {
  await ensureReady();
  return query(toPg(sql), params);
}

export async function run(sql: string, params: SqlValue[] = []): Promise<void> {
  await exec(sql, params);
}

export async function getRow(
  sql: string,
  params: SqlValue[] = [],
): Promise<Record<string, unknown> | undefined> {
  const result = await exec(sql, params);
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return row;
}

export async function allRows(
  sql: string,
  params: SqlValue[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await exec(sql, params);
  return result.rows;
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await ensureReady();
  const existing = txStore.getStore();
  if (existing) return fn();
  const client = await getPool().connect();
  const q = client as unknown as Queryable;
  try {
    await q.query("BEGIN");
    const result = await txStore.run(client, fn);
    await q.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await q.query("ROLLBACK");
    } catch {
      /* ignore rollback failure after a dead connection */
    }
    throw error;
  } finally {
    client.release();
  }
}
