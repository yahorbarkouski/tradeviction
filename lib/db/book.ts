// The Book: positions, the lots that price them, the events log, and the
// daily move budget. Every write here goes through applyOne inside one
// transaction, and scores against the world as it stood before the write.
import { randomUUID } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { STALE_BOOK, planChanges, sameHeld, type BookChange, type HeldNote } from "@/lib/book";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intNull, intish, num, numNull, str, strNull } from "@/lib/db/codec";
import { getStartupById, getStartupsByIds } from "@/lib/db/startups";
import {
  cachedWorld,
  cachedWorldData,
  discoveryOf,
  entryP,
  loadWorld,
  marketOf,
  scoreLots,
  scoreOneLot,
  scoredEntryPulse,
  worldAt,
  type World,
} from "@/lib/engine";
import { ACTIVE_MIN, CONVICTION_CAP, MOVES_PER_DAY, RECEIPT_ALPHA, quietHoldDays, utcDay } from "@/lib/market";
import { startupTag } from "@/lib/tags";
import {
  isDirection,
  isEventKind,
  type BookEvent,
  type BookLine,
  type Direction,
  type EventKind,
  type Lot,
  type Position,
  type Receipt,
  type Startup,
} from "@/lib/types";

export class BookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookError";
  }
}

function parsePosition(row: Record<string, unknown>): Position {
  const direction = str(row, "direction");
  if (!isDirection(direction)) throw new Error("bad direction");
  return {
    id: str(row, "id"),
    startupId: str(row, "startup_id"),
    userId: str(row, "user_id"),
    username: str(row, "username"),
    direction,
    conviction: int(row, "conviction"),
    note: str(row, "note"),
    openedAt: int(row, "opened_at"),
    updatedAt: int(row, "updated_at"),
    closedAt: intNull(row, "closed_at"),
  };
}

export function parseLot(row: Record<string, unknown>): Lot {
  const direction = str(row, "direction");
  if (!isDirection(direction)) throw new Error("bad lot");
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    startupId: str(row, "startup_id"),
    positionId: str(row, "position_id"),
    direction,
    conviction: int(row, "conviction"),
    entryP: num(row, "entry_p"),
    entryPulse: int(row, "entry_pulse"),
    entryDepth: int(row, "entry_depth"),
    openedAt: int(row, "opened_at"),
    closedAt: intNull(row, "closed_at"),
    realizedAlpha: numNull(row, "realized_alpha"),
  };
}

function parseEvent(row: Record<string, unknown>): BookEvent {
  const kindRaw = str(row, "kind");
  if (!isEventKind(kindRaw)) throw new Error("bad event");
  const directionRaw = strNull(row, "direction");
  const direction = directionRaw && isDirection(directionRaw) ? directionRaw : null;
  return {
    id: str(row, "id"),
    userId: str(row, "user_id"),
    username: str(row, "username"),
    startupId: str(row, "startup_id"),
    kind: kindRaw,
    direction,
    conviction: intNull(row, "conviction"),
    pulse: int(row, "pulse"),
    depth: int(row, "depth"),
    note: strNull(row, "note"),
    createdAt: int(row, "created_at"),
  };
}

export async function getActivePosition(startupId: string, userId: string): Promise<Position | null> {
  const row = await getRow(
    `SELECT p.*, u.username
     FROM positions p JOIN users u ON u.id = p.user_id
     WHERE p.startup_id = ? AND p.user_id = ? AND p.closed_at IS NULL`,
    [startupId, userId],
  );
  return row ? parsePosition(row) : null;
}

export async function listEventsForStartup(startupId: string): Promise<BookEvent[]> {
  return (
    await allRows(
      `SELECT e.*, u.username
     FROM events e JOIN users u ON u.id = e.user_id
     WHERE e.startup_id = ?
     ORDER BY e.created_at DESC`,
      [startupId],
    )
  ).map(parseEvent);
}

export async function cachedEvents(startupId: string): Promise<BookEvent[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(startupTag(startupId));
  return listEventsForStartup(startupId);
}

async function deployedExcept(userId: string, positionId: string | null): Promise<number> {
  const row = positionId
    ? await getRow(
        `SELECT COALESCE(SUM(conviction), 0) AS n
         FROM positions WHERE user_id = ? AND closed_at IS NULL AND id != ?`,
        [userId, positionId],
      )
    : await getRow(
        `SELECT COALESCE(SUM(conviction), 0) AS n
         FROM positions WHERE user_id = ? AND closed_at IS NULL`,
        [userId],
      );
  return row ? intish(row, "n") : 0;
}

export async function countDeployed(userId: string): Promise<number> {
  return await deployedExcept(userId, null);
}

async function movesUsed(userId: string, at = Date.now()): Promise<number> {
  const row = await getRow("SELECT n FROM moves WHERE user_id = ? AND day = ?", [userId, utcDay(at)]);
  return row ? int(row, "n") : 0;
}

export async function movesLeft(userId: string, at = Date.now()): Promise<number> {
  return Math.max(0, MOVES_PER_DAY - (await movesUsed(userId, at)));
}

async function consumeMove(userId: string, at: number): Promise<void> {
  const day = utcDay(at);
  const used = await movesUsed(userId, at);
  if (used >= MOVES_PER_DAY) {
    throw new BookError(`No commitment moves left today (${MOVES_PER_DAY}/${MOVES_PER_DAY}).`);
  }
  if (used === 0) await run("INSERT INTO moves (user_id, day, n) VALUES (?, ?, 1)", [userId, day]);
  else await run("UPDATE moves SET n = n + 1 WHERE user_id = ? AND day = ?", [userId, day]);
}

async function insertEvent(input: {
  userId: string;
  startupId: string;
  kind: EventKind;
  direction: Direction | null;
  conviction: number | null;
  pulse: number;
  depth: number;
  note: string | null;
  at: number;
}): Promise<void> {
  await run(
    `INSERT INTO events (id, user_id, startup_id, kind, direction, conviction, pulse, depth, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.userId,
      input.startupId,
      input.kind,
      input.direction,
      input.conviction,
      input.pulse,
      input.depth,
      input.note,
      input.at,
    ],
  );
}

async function insertThesisComment(input: {
  startupId: string;
  userId: string;
  positionId: string;
  text: string;
  at: number;
}): Promise<void> {
  if (!input.text.trim()) return;
  await run(
    `INSERT INTO comments (id, startup_id, user_id, parent_id, position_id, text, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    [randomUUID(), input.startupId, input.userId, input.positionId, input.text, input.at],
  );
}

async function openLots(positionId: string): Promise<Lot[]> {
  return (
    await allRows(`SELECT * FROM lots WHERE position_id = ? AND closed_at IS NULL ORDER BY opened_at DESC`, [
      positionId,
    ])
  ).map(parseLot);
}

async function snapshot(startupId: string, at: number): Promise<{ pulse: number; p: number; depth: number }> {
  const market = marketOf(await loadWorld(at), startupId);
  return { pulse: market.pulse, p: market.p, depth: market.depth };
}

async function addLot(input: {
  userId: string;
  startupId: string;
  positionId: string;
  direction: Direction;
  conviction: number;
  at: number;
}): Promise<void> {
  if (input.conviction < ACTIVE_MIN) return;
  const world = await loadWorld(input.at);
  const p = entryP(world, input.startupId, input.userId, input.at);
  const market = marketOf(world, input.startupId);
  await run(
    `INSERT INTO lots
      (id, user_id, startup_id, position_id, direction, conviction, entry_p, entry_pulse, entry_depth, opened_at, closed_at, realized_alpha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [
      randomUUID(),
      input.userId,
      input.startupId,
      input.positionId,
      input.direction,
      input.conviction,
      p,
      Math.round(p * 100),
      market.depth,
      input.at,
    ],
  );
}

async function realizeLot(world: World, lot: Lot, amount: number, at: number): Promise<void> {
  const alpha = scoreOneLot(world, lot, amount, at);
  if (amount === lot.conviction) {
    await run("UPDATE lots SET closed_at = ?, realized_alpha = ? WHERE id = ?", [at, alpha, lot.id]);
    return;
  }
  await run("UPDATE lots SET conviction = ? WHERE id = ?", [lot.conviction - amount, lot.id]);
  await run(
    `INSERT INTO lots
      (id, user_id, startup_id, position_id, direction, conviction, entry_p, entry_pulse, entry_depth, opened_at, closed_at, realized_alpha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      lot.userId,
      lot.startupId,
      lot.positionId,
      lot.direction,
      amount,
      lot.entryP,
      lot.entryPulse,
      lot.entryDepth,
      lot.openedAt,
      at,
      alpha,
    ],
  );
}

// One world read per batch. A user's own lots never count toward their own
// price, so every lot in the batch scores against the state before the batch.
async function decreaseLots(positionId: string, amount: number, at: number): Promise<void> {
  const lots = await openLots(positionId);
  if (lots.length === 0) return;
  const world = await loadWorld(at);
  let left = amount;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.conviction, left);
    await realizeLot(world, lot, take, at);
    left -= take;
  }
}

async function closeAllLots(positionId: string, at: number): Promise<void> {
  const lots = await openLots(positionId);
  if (lots.length === 0) return;
  const world = await loadWorld(at);
  for (const lot of lots) await realizeLot(world, lot, lot.conviction, at);
}

type BookInput = {
  startupId: string;
  userId: string;
  direction: Direction;
  conviction: number;
  note: string;
  close?: boolean;
};

function assertConviction(conviction: number): void {
  if (!Number.isInteger(conviction) || conviction < 0 || conviction > CONVICTION_CAP) {
    throw new BookError("Conviction must be an integer from 0 to 100.");
  }
}

export async function applyBookChange(input: BookInput): Promise<EventKind> {
  const at = Date.now();
  assertConviction(input.conviction);
  return await withTransaction(() => applyOne(input, at));
}

// The open positions a user holds, by startup.
export async function listHeld(userId: string): Promise<Map<string, HeldNote>> {
  const held = new Map<string, HeldNote>();
  for (const row of await allRows(
    "SELECT startup_id, direction, conviction, note FROM positions WHERE user_id = ? AND closed_at IS NULL",
    [userId],
  )) {
    const direction = str(row, "direction");
    if (!isDirection(direction)) continue;
    held.set(str(row, "startup_id"), { direction, conviction: int(row, "conviction"), note: str(row, "note") });
  }
  return held;
}

// Several changes as one commit. Every change is checked against the Book as
// it is now, the cap and the day's moves are checked for the whole batch, and
// then the changes land in an order that frees Conviction before spending it.
// Nothing is written when any of that fails.
export async function applyBookChanges(input: { userId: string; changes: BookChange[] }): Promise<EventKind[]> {
  const at = Date.now();
  for (const change of input.changes) assertConviction(change.conviction);
  return await withTransaction(async () => {
    const held = await listHeld(input.userId);
    for (const change of input.changes) {
      if (!sameHeld(held.get(change.startupId) ?? null, change.from)) throw new BookError(STALE_BOOK);
    }
    const startups = await getStartupsByIds(input.changes.map((change) => change.startupId));
    for (const change of input.changes) {
      if (!startups.has(change.startupId)) throw new BookError("Company not found.");
    }
    const plan = planChanges(held, input.changes);
    if (plan.staged.length === 0) throw new BookError("Nothing to change.");
    if (plan.deployed > CONVICTION_CAP) {
      throw new BookError(`That adds up to ${plan.deployed} Conviction. Your Book holds ${CONVICTION_CAP}.`);
    }
    const left = await movesLeft(input.userId, at);
    if (plan.moves > left) {
      throw new BookError(`Needs ${plan.moves} ${plan.moves === 1 ? "move" : "moves"}. ${left} left today.`);
    }
    const kinds: EventKind[] = [];
    for (const { change } of plan.staged) {
      kinds.push(await applyOne({ ...change, userId: input.userId }, at));
    }
    return kinds;
  });
}

// One position change inside the caller's transaction, at the caller's clock.
async function applyOne(input: BookInput, at: number): Promise<EventKind> {
  const current = await getActivePosition(input.startupId, input.userId);
  if (input.close) {
    if (!current) throw new BookError("No open position to close.");
    await closeAllLots(current.id, at);
    await run("UPDATE positions SET closed_at = ?, updated_at = ? WHERE id = ?", [at, at, current.id]);
    const mark = await snapshot(input.startupId, at);
    await insertEvent({
      userId: input.userId,
      startupId: input.startupId,
      kind: "close",
      direction: current.direction,
      conviction: current.conviction,
      pulse: mark.pulse,
      depth: mark.depth,
      note: current.note,
      at,
    });
    return "close";
  }

  const others = await deployedExcept(input.userId, current?.id ?? null);
  if (others + input.conviction > CONVICTION_CAP) {
    throw new BookError(`Only ${CONVICTION_CAP - others} Conviction left in your Book.`);
  }

  if (!current) {
    await consumeMove(input.userId, at);
    const id = randomUUID();
    await run(
      `INSERT INTO positions
        (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [id, input.userId, input.startupId, input.direction, input.conviction, input.note, at, at],
    );
    await addLot({
      userId: input.userId,
      startupId: input.startupId,
      positionId: id,
      direction: input.direction,
      conviction: input.conviction,
      at,
    });
    const mark = await snapshot(input.startupId, at);
    await insertThesisComment({
      startupId: input.startupId,
      userId: input.userId,
      positionId: id,
      text: input.note,
      at,
    });
    await insertEvent({
      userId: input.userId,
      startupId: input.startupId,
      kind: "open",
      direction: input.direction,
      conviction: input.conviction,
      pulse: mark.pulse,
      depth: mark.depth,
      note: input.note,
      at,
    });
    return "open";
  }

  if (current.direction !== input.direction) {
    await consumeMove(input.userId, at);
    await closeAllLots(current.id, at);
    await run("UPDATE positions SET direction = ?, conviction = ?, note = ?, updated_at = ? WHERE id = ?", [
      input.direction,
      input.conviction,
      input.note,
      at,
      current.id,
    ]);
    await addLot({
      userId: input.userId,
      startupId: input.startupId,
      positionId: current.id,
      direction: input.direction,
      conviction: input.conviction,
      at,
    });
    const mark = await snapshot(input.startupId, at);
    await insertThesisComment({
      startupId: input.startupId,
      userId: input.userId,
      positionId: current.id,
      text: input.note,
      at,
    });
    await insertEvent({
      userId: input.userId,
      startupId: input.startupId,
      kind: "flip",
      direction: input.direction,
      conviction: input.conviction,
      pulse: mark.pulse,
      depth: mark.depth,
      note: input.note,
      at,
    });
    return "flip";
  }

  if (current.conviction !== input.conviction) {
    const kind: EventKind = input.conviction > current.conviction ? "increase" : "decrease";
    if (kind === "increase") await consumeMove(input.userId, at);
    if (kind === "increase") {
      await addLot({
        userId: input.userId,
        startupId: input.startupId,
        positionId: current.id,
        direction: current.direction,
        conviction: input.conviction - current.conviction,
        at,
      });
    } else {
      await decreaseLots(current.id, current.conviction - input.conviction, at);
    }
    await run("UPDATE positions SET conviction = ?, note = ?, updated_at = ? WHERE id = ?", [
      input.conviction,
      input.note,
      at,
      current.id,
    ]);
    const mark = await snapshot(input.startupId, at);
    if (input.note !== current.note) {
      await insertThesisComment({
        startupId: input.startupId,
        userId: input.userId,
        positionId: current.id,
        text: input.note,
        at,
      });
    }
    await insertEvent({
      userId: input.userId,
      startupId: input.startupId,
      kind,
      direction: current.direction,
      conviction: input.conviction,
      pulse: mark.pulse,
      depth: mark.depth,
      note: input.note,
      at,
    });
    return kind;
  }

  if (input.note === current.note) throw new BookError("Nothing to change.");
  await run("UPDATE positions SET note = ?, updated_at = ? WHERE id = ?", [input.note, at, current.id]);
  await insertThesisComment({
    startupId: input.startupId,
    userId: input.userId,
    positionId: current.id,
    text: input.note,
    at,
  });
  const mark = await snapshot(input.startupId, at);
  await insertEvent({
    userId: input.userId,
    startupId: input.startupId,
    kind: "thesis",
    direction: current.direction,
    conviction: current.conviction,
    pulse: mark.pulse,
    depth: mark.depth,
    note: input.note,
    at,
  });
  return "thesis";
}

async function lineFrom(position: Position, startup: Startup, lots: Lot[], world: World): Promise<BookLine> {
  const scored = scoreLots(world, position.startupId, position.userId, lots);
  const market = marketOf(world, position.startupId);
  const open = lots.filter((lot) => lot.closedAt === null);
  const staked = open.reduce((sum, lot) => sum + lot.conviction, 0);
  let entryPulse =
    staked > 0
      ? Math.round(open.reduce((sum, lot) => sum + scoredEntryPulse(world, lot) * lot.conviction, 0) / staked)
      : market.pulse;
  let entryDepth = open.length > 0 ? Math.min(...open.map((lot) => lot.entryDepth)) : 0;
  if (staked === 0) {
    const opened = await getRow(
      `SELECT pulse, depth FROM events
       WHERE user_id = ? AND startup_id = ? AND kind = 'open'
       ORDER BY created_at ASC LIMIT 1`,
      [position.userId, position.startupId],
    );
    if (opened) {
      entryPulse = int(opened, "pulse");
      entryDepth = int(opened, "depth");
    }
  }
  const discovery = discoveryOf(world, position.startupId);
  let daysEarly: number | null = null;
  if (discovery?.confirmed) {
    const earliest = open.reduce((min, lot) => Math.min(min, lot.openedAt), Number.POSITIVE_INFINITY);
    if (Number.isFinite(earliest)) {
      const hold = quietHoldDays(earliest, null, discovery.quietStart, discovery.quietEnd);
      if (hold > 0) daysEarly = Math.round(hold);
    }
  }
  return {
    position,
    startup,
    pulse: market.pulse,
    liveAlpha: scored.total,
    priceAlpha: scored.price,
    discoveryAlpha: scored.discovery,
    carryAlpha: scored.carry,
    entryPulse,
    entryDepth,
    daysEarly,
  };
}

export async function listUserBook(userId: string, now = Date.now()): Promise<BookLine[]> {
  const positions = (
    await allRows(
      `SELECT p.*, u.username
     FROM positions p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ? AND p.closed_at IS NULL
     ORDER BY p.conviction DESC, p.opened_at ASC`,
      [userId],
    )
  ).map(parsePosition);
  const startups = await getStartupsByIds(positions.map((p) => p.startupId));
  const lotsByPosition = new Map<string, Lot[]>();
  for (const lot of (await allRows("SELECT * FROM lots WHERE user_id = ? AND closed_at IS NULL", [userId])).map(
    parseLot,
  )) {
    const list = lotsByPosition.get(lot.positionId) ?? [];
    list.push(lot);
    lotsByPosition.set(lot.positionId, list);
  }
  const world = await cachedWorld(now);
  const lines: BookLine[] = [];
  for (const position of positions) {
    const startup = startups.get(position.startupId);
    if (!startup) continue;
    lines.push(await lineFrom(position, startup, lotsByPosition.get(position.id) ?? [], world));
  }
  return lines;
}

export async function getBookLine(startupId: string, userId: string, now = Date.now()): Promise<BookLine | null> {
  const position = await getActivePosition(startupId, userId);
  if (!position) return null;
  const startup = await getStartupById(startupId);
  if (!startup) return null;
  const lots = (await allRows("SELECT * FROM lots WHERE position_id = ? AND closed_at IS NULL", [position.id])).map(
    parseLot,
  );
  return await lineFrom(position, startup, lots, await cachedWorld(now));
}

export async function listUserReceipts(userId: string): Promise<Receipt[]> {
  const [lotRows, data] = await Promise.all([
    allRows("SELECT * FROM lots WHERE user_id = ? ORDER BY opened_at ASC", [userId]),
    cachedWorldData(),
  ]);
  const lots = lotRows.map(parseLot);
  const startups = await getStartupsByIds([...new Set(lots.map((lot) => lot.startupId))]);
  const grouped = new Map<string, Lot[]>();
  for (const lot of lots) {
    const list = grouped.get(lot.positionId) ?? [];
    list.push(lot);
    grouped.set(lot.positionId, list);
  }
  const out: Receipt[] = [];
  for (const group of grouped.values()) {
    const first = group[0];
    if (!first) continue;
    const startup = startups.get(first.startupId);
    if (!startup) continue;
    const closed = group.every((lot) => lot.closedAt !== null);
    if (!closed) continue;
    const closedAt = Math.max(...group.map((lot) => lot.closedAt ?? 0));
    const market = marketOf(worldAt(data, closedAt), first.startupId);
    const alpha = group.reduce((sum, lot) => sum + (lot.realizedAlpha ?? 0), 0);
    if (Math.abs(alpha) < RECEIPT_ALPHA) continue;
    const staked = group.reduce((sum, lot) => sum + lot.conviction, 0);
    const entryPulse = Math.round(group.reduce((sum, lot) => sum + lot.entryPulse * lot.conviction, 0) / staked);
    const entryDepth = Math.min(...group.map((lot) => lot.entryDepth));
    out.push({
      startup,
      direction: first.direction,
      entryPulse,
      exitPulse: market.pulse,
      entryDepth,
      conviction: staked,
      alpha,
      openedAt: Math.min(...group.map((lot) => lot.openedAt)),
      closedAt,
      live: false,
    });
  }
  out.sort((a, b) => Math.abs(b.alpha) - Math.abs(a.alpha));
  return out.slice(0, 8);
}
