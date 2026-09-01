import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { SCHEMA } from "@/lib/db/schema";
import { migrate } from "@/lib/db/migrate";

export type SqlValue = string | number | null | bigint | boolean;

const txStore = new AsyncLocalStorage<PoolClient>();

const globalForDb = globalThis as typeof globalThis & {
  __losPool?: Pool;
  __losReady?: Promise<void>;
};

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  url.searchParams.delete("channel_binding");
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

function getPool(): Pool {
  if (!globalForDb.__losPool) {
    globalForDb.__losPool = new Pool({ connectionString: databaseUrl() });
  }
  return globalForDb.__losPool;
}

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function rawQuery(sql: string, params: SqlValue[] = []) {
  return getPool().query(toPg(sql), params);
}

async function applySchema(): Promise<void> {
  const statements = SCHEMA.split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await getPool().query(statement);
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

async function exec(sql: string, params: SqlValue[]) {
  await ensureReady();
  const text = toPg(sql);
  const client = txStore.getStore();
  if (client) return client.query(text, params);
  return getPool().query(text, params);
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
  return row as Record<string, unknown>;
}

export async function allRows(
  sql: string,
  params: SqlValue[] = [],
): Promise<Record<string, unknown>[]> {
  const result = await exec(sql, params);
  return result.rows as Record<string, unknown>[];
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await ensureReady();
  const existing = txStore.getStore();
  if (existing) return fn();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await txStore.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback failure after a dead connection */
    }
    throw error;
  } finally {
    client.release();
  }
}
