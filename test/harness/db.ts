import { allRows, getRow, run } from "@/lib/db";

const TABLES = [
  "comment_votes",
  "comment_flags",
  "comment_vouches",
  "comments",
  "lots",
  "events",
  "positions",
  "moves",
  "rate_log",
  "startups",
  "users",
];

export async function resetDb(): Promise<void> {
  await run(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
  // The catalog rows are gone, so the marker that says they were seeded goes too.
  await run("DELETE FROM meta WHERE key = 'catalog'");
}

type PoolLike = { end: () => Promise<void> };

export async function closeDb(): Promise<void> {
  const g = globalThis as typeof globalThis & { __losPool?: PoolLike; __losReady?: Promise<void> };
  await g.__losPool?.end();
  g.__losPool = undefined;
  g.__losReady = undefined;
}

export async function count(table: string, where = "TRUE", params: (string | number | null)[] = []): Promise<number> {
  const row = await getRow(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
  return Number(row?.n ?? 0);
}

export { allRows, getRow, run };
