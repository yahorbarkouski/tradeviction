// The rate log behind lib/guard.ts: one row per counted write, by account
// and by address.
import { getRow, run } from "@/lib/db";
import { intNull, intish } from "@/lib/db/codec";

export const RATE_KINDS = [
  "register",
  "login",
  "submit",
  "comment",
  "vote",
  "book",
  "flag",
  "verify",
  "party",
] as const;

export type RateKind = (typeof RATE_KINDS)[number];

export async function logRate(input: { userId: string | null; ip: string; kind: RateKind }): Promise<void> {
  await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, ?, ?)", [
    input.userId,
    input.ip,
    input.kind,
    Date.now(),
  ]);
}

export async function lastRate(filter: { userId?: string; ip?: string; kind: RateKind }): Promise<number | null> {
  const row = filter.userId
    ? await getRow("SELECT MAX(created_at) AS at FROM rate_log WHERE user_id = ? AND kind = ?", [
        filter.userId,
        filter.kind,
      ])
    : await getRow("SELECT MAX(created_at) AS at FROM rate_log WHERE ip = ? AND kind = ?", [
        filter.ip ?? "",
        filter.kind,
      ]);
  return row ? intNull(row, "at") : null;
}

export async function countRate(filter: {
  userId?: string;
  ip?: string;
  kind: RateKind;
  since: number;
}): Promise<number> {
  const row = filter.userId
    ? await getRow("SELECT COUNT(*) AS n FROM rate_log WHERE user_id = ? AND kind = ? AND created_at > ?", [
        filter.userId,
        filter.kind,
        filter.since,
      ])
    : await getRow("SELECT COUNT(*) AS n FROM rate_log WHERE ip = ? AND kind = ? AND created_at > ?", [
        filter.ip ?? "",
        filter.kind,
        filter.since,
      ]);
  return row ? intish(row, "n") : 0;
}

// Every actor together, for site-wide ceilings such as paid lookups.
export async function countRateAll(kind: RateKind, since: number): Promise<number> {
  const row = await getRow("SELECT COUNT(*) AS n FROM rate_log WHERE kind = ? AND created_at > ?", [kind, since]);
  return row ? intish(row, "n") : 0;
}
