import { allRows, closePool, getRow, run } from "@/lib/db";

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
  "party_members",
  "parties",
  "startups",
  "users",
];

export async function resetDb(): Promise<void> {
  await run(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
  // The catalog rows are gone, so the marker that says they were seeded goes too.
  await run("DELETE FROM meta WHERE key = 'catalog'");
}

export async function closeDb(): Promise<void> {
  await closePool();
}

export async function count(table: string, where = "TRUE", params: (string | number | null)[] = []): Promise<number> {
  const row = await getRow(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
  return Number(row?.n ?? 0);
}

export { allRows, getRow, run };
