import { cacheLife, cacheTag } from "next/cache";
import { allRows } from "@/lib/db";
import { int, intNull, intish, str } from "@/lib/db/codec";
import {
  ATTENTION_MS,
  ELIGIBLE_AGE_MS,
  ELIGIBLE_STARTUPS,
  HOTNESS_BREAKOUT,
  SERIES_DAYS,
  discover,
  firstSeen,
  genesisAt,
  heatAt,
  hotnessDisplay,
  lastOpenP,
  phaseOf,
  pulseDisplay,
  pulseP,
  scoreLot,
  tallyAt,
  windowActors,
  quietStreakDays,
  type Counted,
  type Discovery,
  type Genesis,
  type Heat,
  type Slice,
  type Touch,
} from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import type { Lot, Market } from "@/lib/types";
import { isDirection } from "@/lib/types";

export type WorldSlice = Slice & { startupId: string; conviction: number };

type UserMeta = {
  createdAt: number;
  muted: boolean;
  trusted: boolean;
  verified: boolean;
  endorsedAt: number | null;
  firsts: number[];
};

// Everything the scoring engine reads from the database, independent of "now".
export type WorldData = {
  users: Map<string, UserMeta>;
  origins: Map<string, number>;
  slices: Map<string, Slice[]>;
  books: Map<string, WorldSlice[]>;
  touches: Map<string, Touch[]>;
  comments: Map<string, number>;
};

export type World = WorldData & { now: number };

type Memo = {
  genesis: Genesis;
  discovery: Discovery | null;
  quietDays: number;
  weekActors: number;
  heat: Heat;
};

const memos = new WeakMap<World, Map<string, Memo>>();

async function readWorldData(): Promise<WorldData> {
  const [userRows, firstRows, startupRows, lotRows, positionRows, touchRows, commentRows, endorsementRows] =
    await Promise.all([
      allRows("SELECT id, created_at, muted, trusted, x_verified FROM users"),
      allRows(`
        SELECT user_id, startup_id, MIN(at) AS first_at FROM (
          SELECT user_id, startup_id, opened_at AS at FROM positions
          UNION ALL
          SELECT user_id, startup_id, created_at AS at FROM comments
        ) GROUP BY user_id, startup_id
      `),
      allRows("SELECT id, created_at FROM startups"),
      allRows("SELECT startup_id, user_id, direction, opened_at, closed_at FROM lots"),
      allRows("SELECT startup_id, user_id, direction, conviction, opened_at, closed_at FROM positions"),
      allRows(`
        SELECT user_id, startup_id, created_at AS at FROM events
        UNION ALL
        SELECT user_id, startup_id, created_at AS at FROM comments
      `),
      allRows("SELECT startup_id, COUNT(*) AS n FROM comments GROUP BY startup_id"),
      allRows(`
        SELECT c.user_id, MIN(cv.created_at) AS at
        FROM comment_votes cv
        JOIN comments c ON c.id = cv.comment_id
        JOIN users e ON e.id = cv.user_id
        WHERE e.id <> c.user_id
          AND COALESCE(e.muted, 0) = 0
          AND (COALESCE(e.trusted, 0) = 1 OR COALESCE(e.x_verified, 0) = 1)
        GROUP BY c.user_id
      `),
    ]);

  const users = new Map<string, UserMeta>();
  for (const row of userRows) {
    users.set(str(row, "id"), {
      createdAt: int(row, "created_at"),
      muted: intish(row, "muted") === 1,
      trusted: intish(row, "trusted") === 1,
      verified: intish(row, "x_verified") === 1,
      endorsedAt: null,
      firsts: [],
    });
  }
  for (const row of endorsementRows) {
    const user = users.get(str(row, "user_id"));
    if (user) user.endorsedAt = int(row, "at");
  }
  for (const row of firstRows) {
    const user = users.get(str(row, "user_id"));
    if (!user) continue;
    user.firsts.push(int(row, "first_at"));
  }
  for (const user of users.values()) user.firsts.sort((a, b) => a - b);

  const origins = new Map<string, number>();
  for (const row of startupRows) {
    origins.set(str(row, "id"), int(row, "created_at"));
  }

  const slices = new Map<string, Slice[]>();
  for (const row of lotRows) {
    const direction = str(row, "direction");
    if (!isDirection(direction)) continue;
    const startupId = str(row, "startup_id");
    const slice: Slice = {
      userId: str(row, "user_id"),
      direction,
      openedAt: int(row, "opened_at"),
      closedAt: intNull(row, "closed_at"),
    };
    const list = slices.get(startupId);
    if (list) list.push(slice);
    else slices.set(startupId, [slice]);
  }

  const books = new Map<string, WorldSlice[]>();
  for (const row of positionRows) {
    const direction = str(row, "direction");
    if (!isDirection(direction)) continue;
    const startupId = str(row, "startup_id");
    const book: WorldSlice = {
      startupId,
      userId: str(row, "user_id"),
      direction,
      conviction: int(row, "conviction"),
      openedAt: int(row, "opened_at"),
      closedAt: intNull(row, "closed_at"),
    };
    const list = books.get(startupId);
    if (list) list.push(book);
    else books.set(startupId, [book]);
  }

  const touches = new Map<string, Touch[]>();
  for (const row of touchRows) {
    const startupId = str(row, "startup_id");
    const touch: Touch = { userId: str(row, "user_id"), at: int(row, "at") };
    const list = touches.get(startupId);
    if (list) list.push(touch);
    else touches.set(startupId, [touch]);
  }

  const comments = new Map<string, number>();
  for (const row of commentRows) {
    comments.set(str(row, "startup_id"), int(row, "n"));
  }

  return { users, origins, slices, books, touches, comments };
}

// The whole site shares one entry. Every write that touches users, startups,
// positions, lots, events, or comments calls updateTag("world").
export async function cachedWorldData(): Promise<WorldData> {
  "use cache";
  cacheLife("hours");
  cacheTag("world");
  return readWorldData();
}

export function worldAt(data: WorldData, now: number): World {
  const world: World = { ...data, now };
  memos.set(world, new Map());
  return world;
}

// Read path: pages and rankings.
export async function cachedWorld(now = Date.now()): Promise<World> {
  return worldAt(await cachedWorldData(), now);
}

// Write path: inside a transaction the world must reflect rows written
// earlier in that same transaction, so it is read fresh.
export async function loadWorld(now = Date.now()): Promise<World> {
  return worldAt(await readWorldData(), now);
}

export function accounted(world: World, userId: string, at: number): boolean {
  const user = world.users.get(userId);
  if (!user || user.muted) return false;
  if (user.trusted || user.verified) return true;
  if (at - user.createdAt < ELIGIBLE_AGE_MS) return false;
  if (user.endorsedAt === null || user.endorsedAt > at) return false;
  let n = 0;
  for (const first of user.firsts) {
    if (first > at) break;
    n += 1;
    if (n >= ELIGIBLE_STARTUPS) return true;
  }
  return n >= ELIGIBLE_STARTUPS;
}

export function counted(world: World): Counted {
  return (userId, at) => accounted(world, userId, at);
}

function originOf(world: World, startupId: string): number {
  return world.origins.get(startupId) ?? world.now;
}

function memoOf(world: World, startupId: string): Memo {
  const cache = memos.get(world) ?? new Map();
  const hit = cache.get(startupId);
  if (hit) return hit;
  const slices = world.slices.get(startupId) ?? [];
  const touches = world.touches.get(startupId) ?? [];
  const who = counted(world);
  const genesis = genesisAt(slices, who, world.now);
  const discovery = discover(slices, touches, originOf(world, startupId), world.now, who);
  const quietDays = quietStreakDays(touches, originOf(world, startupId), world.now, who);
  const weekActors = windowActors(touches, world.now - ATTENTION_MS, world.now, who);
  const heat = heatAt(touches, firstSeen(touches), world.now, who);
  const memo: Memo = { genesis, discovery, quietDays, weekActors, heat };
  cache.set(startupId, memo);
  memos.set(world, cache);
  return memo;
}

function bookTally(slices: WorldSlice[], at: number) {
  let convLong = 0;
  let convShort = 0;
  for (const slice of slices) {
    if (slice.openedAt > at) continue;
    if (slice.closedAt !== null && slice.closedAt <= at) continue;
    if (slice.direction === "long") convLong += slice.conviction;
    else convShort += slice.conviction;
  }
  return { convLong, convShort };
}

export function marketOf(world: World, startupId: string): Market {
  const slices = world.slices.get(startupId) ?? [];
  const who = counted(world);
  const publicNow = tallyAt(slices, world.now, who);
  const week = tallyAt(slices, world.now - SERIES_DAYS * DAY_MS, who);
  const book = bookTally(world.books.get(startupId) ?? [], world.now);
  const convTotal = book.convLong + book.convShort;
  const memo = memoOf(world, startupId);
  const hotness = hotnessDisplay(memo.heat.hotness);
  const hot = hotness >= HOTNESS_BREAKOUT;
  const series: (number | null)[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i -= 1) {
    const at = world.now - i * DAY_MS;
    const row = tallyAt(slices, at, who);
    series.push(row.n === 0 ? null : row.p);
  }
  const pulse = pulseDisplay(publicNow.p);
  return {
    pulse,
    p: publicNow.p,
    depth: publicNow.n,
    publicLong: publicNow.long,
    publicShort: publicNow.short,
    convLong: book.convLong,
    convShort: book.convShort,
    convLongPct: convTotal > 0 ? Math.round((book.convLong / convTotal) * 100) : null,
    comments: world.comments.get(startupId) ?? 0,
    delta: pulse - pulseDisplay(week.p),
    series,
    hotness,
    heatActors: memo.heat.actors,
    forming: memo.genesis.kind !== "open",
    quietDays: memo.quietDays,
    weekActors: memo.weekActors,
    quietEndedDays: memo.discovery ? Math.round(memo.discovery.quietDays) : null,
    discovered: Boolean(memo.discovery?.confirmed),
    phase: phaseOf({ genesis: memo.genesis, quietDays: memo.quietDays, hot }),
  };
}

export function discoveryOf(world: World, startupId: string): Discovery | null {
  return memoOf(world, startupId).discovery;
}

export function entryP(world: World, startupId: string, userId: string, openedAt: number): number {
  return tallyAt(world.slices.get(startupId) ?? [], openedAt, counted(world), userId).p;
}

export function scoreLots(world: World, startupId: string, userId: string, lots: Lot[]): {
  price: number;
  discovery: number;
  carry: number;
  total: number;
} {
  const slices = world.slices.get(startupId) ?? [];
  const who = counted(world);
  const memo = memoOf(world, startupId);
  const nowP = lastOpenP(slices, who, world.now, userId).p;
  const genesisP = memo.genesis.kind === "open" ? tallyAt(slices, memo.genesis.at, who, userId).p : pulseP(0, 0);
  const pStar = memo.discovery
    ? tallyAt(slices, Math.min(world.now, memo.discovery.confirmAt), who, userId).p
    : 0.5;
  let price = 0;
  let discovery = 0;
  let carry = 0;
  let realized = 0;
  for (const lot of lots) {
    if (lot.closedAt !== null) {
      realized += lot.realizedAlpha ?? 0;
      continue;
    }
    const row = scoreLot({
      conviction: lot.conviction,
      direction: lot.direction,
      openedAt: lot.openedAt,
      closedAt: lot.closedAt,
      storedEntryP: lot.entryP,
      now: world.now,
      genesis: memo.genesis,
      nowP,
      genesisP,
      discovery: memo.discovery,
      pStar,
    });
    price += row.price;
    discovery += row.discovery;
    carry += row.carry;
  }
  return { price, discovery, carry, total: price + discovery - carry + realized };
}

export function scoreOneLot(world: World, lot: Lot, amount: number, at: number): number {
  const slices = world.slices.get(lot.startupId) ?? [];
  const who = counted(world);
  const genesis = genesisAt(slices, who, at);
  const discovery = discover(
    slices,
    world.touches.get(lot.startupId) ?? [],
    originOf(world, lot.startupId),
    at,
    who,
  );
  const nowP = lastOpenP(slices, who, at, lot.userId).p;
  const genesisP = genesis.kind === "open" ? tallyAt(slices, genesis.at, who, lot.userId).p : pulseP(0, 0);
  const pStar = discovery ? tallyAt(slices, Math.min(at, discovery.confirmAt), who, lot.userId).p : 0.5;
  return scoreLot({
    conviction: amount,
    direction: lot.direction,
    openedAt: lot.openedAt,
    closedAt: at,
    storedEntryP: lot.entryP,
    now: at,
    genesis,
    nowP,
    genesisP,
    discovery,
    pStar,
  }).total;
}

export function emptyMarket(): Market {
  return {
    pulse: pulseDisplay(pulseP(0, 0)),
    p: pulseP(0, 0),
    depth: 0,
    publicLong: 0,
    publicShort: 0,
    convLong: 0,
    convShort: 0,
    convLongPct: null,
    comments: 0,
    delta: null,
    series: Array.from({ length: SERIES_DAYS }, () => null),
    hotness: 0,
    heatActors: 0,
    forming: true,
    quietDays: 0,
    weekActors: 0,
    quietEndedDays: null,
    discovered: false,
    phase: "forming",
  };
}

export function scoredEntryPulse(world: World, lot: Lot): number {
  const slices = world.slices.get(lot.startupId) ?? [];
  const who = counted(world);
  const genesis = genesisAt(slices, who, world.now);
  if (genesis.kind === "open" && lot.openedAt <= genesis.at) {
    return pulseDisplay(tallyAt(slices, genesis.at, who, lot.userId).p);
  }
  return lot.entryPulse;
}
