import { DAY_MS } from "@/lib/time";
import type { Phase } from "@/lib/types";

export const CONVICTION_CAP = 100;
export const MOVES_PER_DAY = 30;
export const ACTIVE_MIN = 1;
export const PRIOR = 2;
export const PULSE_FLOOR = 0.01;
export const PULSE_CEIL = 0.99;
export const SERIES_DAYS = 7;
export const GENESIS_N = 20;
export const GENESIS_WINDOW_MS = 48 * 3_600_000;
export const FREEZE_N = 10;
export const QUIET_H = 5;
export const QUIET_MIN_DAYS = 14;
export const ATTENTION_MS = 7 * DAY_MS;
export const HEAT_MS = 72 * 3_600_000;
export const HEAT_PRIOR = 5;
export const HEAT_BASELINE_DAYS = 28;
export const HOTNESS_SCALE = 2.5;
export const HOTNESS_BREAKOUT = 60;
export const CARRY_RHO = 0.002;
export const DISCOVERY_LAMBDA = 1;
export const ELIGIBLE_AGE_MS = 7 * DAY_MS;
export const ELIGIBLE_STARTUPS = 3;
export const KARMA_PAIR_CAP = 3;
export const KARMA_PAIR_WINDOW_MS = 30 * DAY_MS;
export const KARMA_DAY_CAP = 20;
export const FLAG_KARMA = 5;
export const VOUCH_KARMA = 10;
export const FLAG_KILL = 3;
export const FRESH_MS = 14 * DAY_MS;
export const PROVISIONAL_WEIGHT = 0.1;
export const RANK_HALF_LIFE_MS = 48 * 3_600_000;

export type DirectionSign = -1 | 1;

export function clampP(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(PULSE_CEIL, Math.max(PULSE_FLOOR, p));
}

export function pulseP(publicLong: number, publicShort: number): number {
  const long = Math.max(0, publicLong);
  const short = Math.max(0, publicShort);
  return (PRIOR + long) / (PRIOR * 2 + long + short);
}

export function pulseDisplay(p: number): number {
  return Math.round(p * 100);
}

export function logit(p: number): number {
  const x = clampP(p);
  return Math.log(x / (1 - x));
}

export function signOf(direction: "long" | "short"): DirectionSign {
  return direction === "long" ? 1 : -1;
}

export function priceAlpha(conviction: number, direction: "long" | "short", entryP: number, nowP: number): number {
  return conviction * signOf(direction) * (logit(nowP) - logit(entryP));
}

export function earlyness(days: number): number {
  const d = Math.min(Math.max(0, days), 365);
  return Math.log(1 + d / 7);
}

export function quietHoldDays(openedAt: number, closedAt: number | null, quietStart: number, quietEnd: number): number {
  const from = Math.max(openedAt, quietStart);
  const to = Math.min(closedAt ?? quietEnd, quietEnd);
  return Math.max(0, (to - from) / DAY_MS);
}

export function discoveryAlpha(input: {
  conviction: number;
  direction: "long" | "short";
  holdDays: number;
  pStar: number;
}): number {
  const confirm = signOf(input.direction) * (2 * clampP(input.pStar) - 1);
  return DISCOVERY_LAMBDA * input.conviction * earlyness(input.holdDays) * confirm;
}

export function carryCost(conviction: number, openedAt: number, endedAt: number): number {
  const days = Math.max(0, Math.floor((endedAt - openedAt) / DAY_MS));
  return CARRY_RHO * conviction * days;
}

export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function utcDayStart(at: number): number {
  const iso = utcDay(at);
  return Date.parse(`${iso}T00:00:00.000Z`);
}

export type Slice = {
  userId: string;
  direction: "long" | "short";
  openedAt: number;
  closedAt: number | null;
};

export type Touch = {
  userId: string;
  at: number;
};

export type Counted = (userId: string, at: number) => boolean;

export type Genesis =
  | { kind: "forming" }
  | { kind: "window"; startedAt: number; endsAt: number }
  | { kind: "open"; at: number; p: number };

export type Discovery = {
  quietStart: number;
  quietEnd: number;
  confirmAt: number;
  confirmed: boolean;
  pStar: number;
  windowActors: number;
  quietDays: number;
};

export type Heat = {
  actors: number;
  baseline: number;
  fresh: number;
  heat: number;
  hotness: number;
};

export function tallyAt(
  slices: Slice[],
  at: number,
  counted: Counted,
  excludeUserId?: string,
): { long: number; short: number; n: number; p: number } {
  let long = 0;
  let short = 0;
  const seen = new Set<string>();
  for (const slice of slices) {
    if (slice.openedAt > at) continue;
    if (slice.closedAt !== null && slice.closedAt <= at) continue;
    if (excludeUserId && slice.userId === excludeUserId) continue;
    if (seen.has(slice.userId)) continue;
    if (!counted(slice.userId, at)) continue;
    seen.add(slice.userId);
    if (slice.direction === "long") long += 1;
    else short += 1;
  }
  return { long, short, n: long + short, p: pulseP(long, short) };
}

export function uniqueTimes(slices: Slice[], extra: number[] = []): number[] {
  const set = new Set(extra);
  for (const slice of slices) {
    set.add(slice.openedAt);
    if (slice.closedAt !== null) set.add(slice.closedAt);
  }
  return [...set].sort((a, b) => a - b);
}

export function genesisAt(slices: Slice[], counted: Counted, now: number): Genesis {
  const times = uniqueTimes(slices, [now]);
  let after = 0;
  for (;;) {
    let hit: number | null = null;
    for (const t of times) {
      if (t < after) continue;
      if (tallyAt(slices, t, counted).n >= GENESIS_N) {
        hit = t;
        break;
      }
    }
    if (hit === null) return { kind: "forming" };
    const ends = hit + GENESIS_WINDOW_MS;
    if (now < ends) return { kind: "window", startedAt: hit, endsAt: ends };
    if (tallyAt(slices, ends, counted).n >= GENESIS_N) {
      return { kind: "open", at: ends, p: tallyAt(slices, ends, counted).p };
    }
    after = ends + 1;
  }
}

export function lastOpenP(
  slices: Slice[],
  counted: Counted,
  now: number,
  excludeUserId?: string,
): { p: number; frozen: boolean } {
  const current = tallyAt(slices, now, counted, excludeUserId);
  if (current.n >= FREEZE_N) return { p: current.p, frozen: false };
  const times = uniqueTimes(slices, [now]);
  for (let i = times.length - 1; i >= 0; i -= 1) {
    const t = times[i];
    if (t === undefined || t > now) continue;
    const row = tallyAt(slices, t, counted, excludeUserId);
    if (row.n >= FREEZE_N) return { p: row.p, frozen: true };
  }
  return { p: current.p, frozen: true };
}

export function windowUsers(touches: Touch[], from: number, to: number, counted: Counted): Set<string> {
  const seen = new Set<string>();
  for (const touch of touches) {
    if (touch.at <= from || touch.at > to) continue;
    if (!counted(touch.userId, touch.at)) continue;
    seen.add(touch.userId);
  }
  return seen;
}

export function windowActors(touches: Touch[], from: number, to: number, counted: Counted): number {
  return windowUsers(touches, from, to, counted).size;
}

export function firstSeen(touches: Touch[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const touch of touches) {
    const prev = map.get(touch.userId);
    if (prev === undefined || touch.at < prev) map.set(touch.userId, touch.at);
  }
  return map;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  const b = sorted[mid - 1];
  if (sorted.length % 2 === 1) return a ?? 0;
  return ((b ?? 0) + (a ?? 0)) / 2;
}

// Whether a recent actor is still in the market. Heat counts touches from the
// last three days, but only from people who still hold a position or a take;
// someone who opened and closed, or posted and deleted, leaves no heat behind.
export type Engaged = (userId: string) => boolean;

export function heatAt(
  touches: Touch[],
  firsts: Map<string, number>,
  at: number,
  counted: Counted,
  engaged: Engaged = () => true,
): Heat {
  const from = at - HEAT_MS;
  const users = new Set([...windowUsers(touches, from, at, counted)].filter(engaged));
  const actors = users.size;
  const samples: number[] = [];
  const baselineEnd = from;
  const origin = baselineEnd - (HEAT_BASELINE_DAYS - 1) * DAY_MS;
  for (let t = origin; t <= baselineEnd; t += DAY_MS) {
    samples.push(windowUsers(touches, t - HEAT_MS, t, counted).size);
  }
  const baseline = median(samples);
  let newcomers = 0;
  for (const id of users) {
    const first = firsts.get(id);
    if (first !== undefined && first > from && first <= at) newcomers += 1;
  }
  const fresh = actors === 0 ? 0 : newcomers / actors;
  const acceleration = Math.max(0, Math.log((actors + HEAT_PRIOR) / (baseline + HEAT_PRIOR)));
  const breadth = Math.log(1 + actors / HEAT_PRIOR);
  const novelty = 0.5 + 0.5 * fresh;
  const heat = acceleration * breadth * novelty;
  const hotness = 100 * (1 - Math.exp(-heat / HOTNESS_SCALE));
  return { actors, baseline, fresh, heat, hotness };
}

export function hotnessDisplay(hotness: number): number {
  return Math.round(Math.min(100, Math.max(0, hotness)));
}

export function dayActors(touches: Touch[], dayStart: number, counted: Counted): number {
  const end = dayStart + DAY_MS - 1;
  return windowActors(touches, end - ATTENTION_MS, end, counted);
}

export function quietStreakDays(touches: Touch[], origin: number, now: number, counted: Counted): number {
  const start = utcDayStart(origin);
  const today = utcDayStart(now);
  let streak = 0;
  for (let t = today; t >= start; t -= DAY_MS) {
    if (dayActors(touches, t, counted) >= QUIET_H) break;
    streak += 1;
  }
  return streak;
}

export function discover(
  slices: Slice[],
  touches: Touch[],
  origin: number,
  now: number,
  counted: Counted,
): Discovery | null {
  const start = utcDayStart(origin);
  const today = utcDayStart(now);
  const firsts = firstSeen(touches);
  let run = 0;
  let runStart: number | null = null;
  let qualified = false;
  let quietStart: number | null = null;
  let quietEnd: number | null = null;
  for (let t = start; t <= today; t += DAY_MS) {
    const h = dayActors(touches, t, counted);
    const end = t + DAY_MS - 1;
    const hot = heatAt(touches, firsts, Math.min(end, now), counted);
    if (h < QUIET_H) {
      if (run === 0) runStart = t;
      run += 1;
      if (run >= QUIET_MIN_DAYS) {
        qualified = true;
        if (quietStart === null && runStart !== null) quietStart = runStart;
      }
      continue;
    }
    if (!qualified) {
      if (hot.hotness >= HOTNESS_BREAKOUT) return null;
      run = 0;
      runStart = null;
      continue;
    }
    if (hot.hotness >= HOTNESS_BREAKOUT) {
      quietEnd = Math.min(end, now);
      break;
    }
    run = 0;
    runStart = null;
  }
  if (quietStart === null || quietEnd === null) return null;
  return {
    quietStart,
    quietEnd,
    confirmAt: quietEnd,
    confirmed: now >= quietEnd,
    pStar: tallyAt(slices, quietEnd, counted).p,
    windowActors: windowActors(touches, quietEnd - HEAT_MS, quietEnd, counted),
    quietDays: (quietEnd - quietStart) / DAY_MS,
  };
}

export function phaseOf(input: {
  genesis: Genesis;
  quietDays: number;
  hot: boolean;
}): Phase {
  if (input.hot) return "hot";
  if (input.genesis.kind === "open") return "active";
  if (input.quietDays >= QUIET_MIN_DAYS) return "quiet";
  return "forming";
}

export function scoreLot(input: {
  conviction: number;
  direction: "long" | "short";
  openedAt: number;
  closedAt: number | null;
  storedEntryP: number;
  now: number;
  genesis: Genesis;
  nowP: number;
  genesisP: number;
  discovery: Discovery | null;
  pStar: number;
}): { price: number; discovery: number; carry: number; total: number } {
  const end = input.closedAt ?? input.now;
  const carry = carryCost(input.conviction, input.openedAt, end);
  if (input.genesis.kind !== "open") {
    return { price: 0, discovery: 0, carry, total: -carry };
  }
  const q = input.openedAt <= input.genesis.at ? input.genesisP : input.storedEntryP;
  const price = priceAlpha(input.conviction, input.direction, q, input.nowP);
  let discovery = 0;
  if (input.discovery?.confirmed) {
    const hold = quietHoldDays(input.openedAt, input.closedAt, input.discovery.quietStart, input.discovery.quietEnd);
    if (hold > 0) {
      discovery = discoveryAlpha({
        conviction: input.conviction,
        direction: input.direction,
        holdDays: hold,
        pStar: input.pStar,
      });
    }
  }
  return { price, discovery, carry, total: price + discovery - carry };
}
