import { headers } from "next/headers";
import { isAdmin } from "@/lib/admin";
import { run, withTransaction } from "@/lib/db";
import { DAY_MS } from "@/lib/time";
import { countRate, countRateAll, lastRate, logRate, type RateKind } from "@/lib/db/queries";
import type { User } from "@/lib/types";

type RateActor = User | { username: string };

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

const HOUR = 3_600_000;

// X lookups cost money per call, so they are capped per account, per address,
// and for the whole site each hour.
const VERIFY_GAP_MS = 10_000;
const VERIFY_PER_USER_HOUR = 10;
const VERIFY_PER_IP_HOUR = 20;
const VERIFY_SITE_HOUR = 120;

function waitText(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 90) return `Retry in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  return `Retry in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function tooFast(waitMs: number): never {
  throw new GuardError(`You're posting too fast. Please slow down. ${waitText(waitMs)}`);
}

function actorId(user: RateActor | null): string | undefined {
  return user && "createdAt" in user ? user.id : undefined;
}

function gapFromLast(last: number | null, gap: number, now: number): void {
  if (last === null) return;
  const wait = last + gap - now;
  if (wait > 0) tooFast(wait);
}

export function honeypotFilled(formData: FormData): boolean {
  return String(formData.get("website") ?? "").trim().length > 0;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return (h.get("x-real-ip") ?? "0.0.0.0").slice(0, 64);
}

function commentGap(ageMs: number): number {
  if (ageMs < 2 * HOUR) return 10 * 60_000;
  if (ageMs < 7 * DAY_MS) return 3 * 60_000;
  return 30_000;
}

function submitGap(ageMs: number): number {
  if (ageMs < DAY_MS) return 6 * HOUR;
  if (ageMs < 7 * DAY_MS) return 2 * HOUR;
  return 30 * 60_000;
}

export async function assertWrite(kind: RateKind, user: RateActor | null, ip?: string): Promise<string> {
  const from = ip ?? (await clientIp());
  if (isAdmin(user)) return from;
  const now = Date.now();
  if (kind === "register") {
    const burst = await lastRate({ ip: from, kind: "register" });
    gapFromLast(burst, 10 * 60_000, now);
    if ((await countRate({ ip: from, kind: "register", since: now - DAY_MS })) >= 3) {
      throw new GuardError("Too many accounts from this network today.");
    }
    return from;
  }
  if (kind === "login") {
    if ((await countRate({ ip: from, kind: "login", since: now - 15 * 60_000 })) >= 12) {
      throw new GuardError("Too many login attempts. Please wait a few minutes.");
    }
    return from;
  }
  if (!user || !("createdAt" in user)) throw new GuardError("Login required.");
  const age = now - user.createdAt;
  if (kind === "vote") {
    gapFromLast(await lastRate({ userId: user.id, kind: "vote" }), 2_000, now);
    if ((await countRate({ userId: user.id, kind: "vote", since: now - HOUR })) >= 40) {
      throw new GuardError("Vote limit for this hour. Please slow down.");
    }
    return from;
  }
  if (kind === "submit") {
    gapFromLast(await lastRate({ userId: user.id, kind: "submit" }), submitGap(age), now);
    return from;
  }
  if (kind === "comment") {
    gapFromLast(await lastRate({ userId: user.id, kind: "comment" }), commentGap(age), now);
    return from;
  }
  if (kind === "verify") {
    gapFromLast(await lastRate({ userId: user.id, kind: "verify" }), VERIFY_GAP_MS, now);
    if (
      (await countRate({ userId: user.id, kind: "verify", since: now - HOUR })) >= VERIFY_PER_USER_HOUR ||
      (await countRate({ ip: from, kind: "verify", since: now - HOUR })) >= VERIFY_PER_IP_HOUR
    ) {
      throw new GuardError("Too many verification checks this hour. Try again later.");
    }
    if ((await countRateAll("verify", now - HOUR)) >= VERIFY_SITE_HOUR) {
      throw new GuardError("X verification is busy right now. Try again later.");
    }
    return from;
  }
  if (kind === "flag") {
    gapFromLast(await lastRate({ userId: user.id, kind: "flag" }), 2_000, now);
    if ((await countRate({ userId: user.id, kind: "flag", since: now - HOUR })) >= 30) {
      throw new GuardError("Too many flags this hour.");
    }
    return from;
  }
  gapFromLast(await lastRate({ userId: user.id, kind: "book" }), 5_000, now);
  return from;
}

export async function recordWrite(kind: RateKind, ip: string, userId: string | null): Promise<void> {
  await logRate({ userId, ip, kind });
}

// The limit check, the write, and the rate log share one transaction under a
// per-actor advisory lock, so parallel requests cannot all pass the gap check.
export async function guarded<T>(
  kind: RateKind,
  user: RateActor | null,
  write: () => Promise<T>,
  actorOf: (result: T) => string | null = () => actorId(user) ?? null,
): Promise<T> {
  const ip = await clientIp();
  return await withTransaction(async () => {
    await run("SELECT pg_advisory_xact_lock(hashtext(?))", [`${kind}:${actorId(user) ?? ip}`]);
    await assertWrite(kind, user, ip);
    const result = await write();
    await recordWrite(kind, ip, actorOf(result));
    return result;
  });
}
