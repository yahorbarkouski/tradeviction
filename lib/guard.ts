import { headers } from "next/headers";
import { DAY_MS } from "@/lib/time";
import { countRate, lastRate, logRate, type RateKind } from "@/lib/db/queries";
import type { User } from "@/lib/types";

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

const HOUR = 3_600_000;

function waitText(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 90) return `Retry in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  return `Retry in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function tooFast(waitMs: number): never {
  throw new GuardError(`You're posting too fast. Please slow down. ${waitText(waitMs)}`);
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

export async function assertWrite(kind: RateKind, user: User | null): Promise<string> {
  const ip = await clientIp();
  const now = Date.now();
  if (kind === "register") {
    const burst = await lastRate({ ip, kind: "register" });
    gapFromLast(burst, 10 * 60_000, now);
    if ((await countRate({ ip, kind: "register", since: now - DAY_MS })) >= 3) {
      throw new GuardError("Too many accounts from this network today.");
    }
    return ip;
  }
  if (kind === "login") {
    if ((await countRate({ ip, kind: "login", since: now - 15 * 60_000 })) >= 12) {
      throw new GuardError("Too many login attempts. Please wait a few minutes.");
    }
    return ip;
  }
  if (!user) throw new GuardError("Login required.");
  const age = now - user.createdAt;
  if (kind === "vote") {
    if (age < 30 * 60_000) throw new GuardError("Account too new to vote.");
    if (user.muted) return ip;
    gapFromLast(await lastRate({ userId: user.id, kind: "vote" }), 2_000, now);
    if ((await countRate({ userId: user.id, kind: "vote", since: now - HOUR })) >= 40) {
      throw new GuardError("Vote limit for this hour. Please slow down.");
    }
    return ip;
  }
  if (kind === "submit") {
    gapFromLast(await lastRate({ userId: user.id, kind: "submit" }), submitGap(age), now);
    return ip;
  }
  if (kind === "comment") {
    gapFromLast(await lastRate({ userId: user.id, kind: "comment" }), commentGap(age), now);
    return ip;
  }
  if (kind === "flag") {
    if (age < 30 * 60_000) throw new GuardError("Account too new.");
    gapFromLast(await lastRate({ userId: user.id, kind: "flag" }), 2_000, now);
    if ((await countRate({ userId: user.id, kind: "flag", since: now - HOUR })) >= 30) {
      throw new GuardError("Too many flags this hour.");
    }
    return ip;
  }
  gapFromLast(await lastRate({ userId: user.id, kind: "book" }), 5_000, now);
  return ip;
}

export async function recordWrite(kind: RateKind, ip: string, userId: string | null): Promise<void> {
  await logRate({ userId, ip, kind });
}
