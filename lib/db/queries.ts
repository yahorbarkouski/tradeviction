import { randomUUID } from "node:crypto";
import { identityFromUrl } from "@/lib/domain";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intNull, intish, num, numNull, str, strNull } from "@/lib/db/codec";
import {
  accounted,
  discoveryOf,
  emptyMarket,
  entryP,
  loadWorld,
  marketOf,
  scoreLots,
  scoreOneLot,
  scoredEntryPulse,
  type World,
} from "@/lib/engine";
import {
  ACTIVE_MIN,
  CONVICTION_CAP,
  KARMA_DAY_CAP,
  KARMA_PAIR_CAP,
  KARMA_PAIR_WINDOW_MS,
  MOVES_PER_DAY,
  FLAG_KILL,
  quietHoldDays,
  utcDay,
} from "@/lib/market";
import { RECEIPT_ALPHA } from "@/lib/game";
import { sortFeed } from "@/lib/ranking";
import { slugify } from "@/lib/slug";
import type {
  BookEvent,
  BookLine,
  Comment,
  Direction,
  EventKind,
  FeedItem,
  FrontComment,
  Leader,
  Leaderboard,
  LookupHit,
  Lot,
  Market,
  PlayerStats,
  Position,
  Receipt,
  Sort,
  Source,
  Startup,
  ThreadNode,
  User,
} from "@/lib/types";
import { isDirection, isEventKind, isSource } from "@/lib/types";

export const PAGE_SIZE = 30;
export const FRONT_PAGE = 40;

export class BookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookError";
  }
}

export type UserRecord = User & { passwordHash: string };

function parseUser(row: Record<string, unknown>): User {
  return {
    id: str(row, "id"),
    username: str(row, "username"),
    createdAt: int(row, "created_at"),
    muted: intish(row, "muted") === 1,
    showDead: intish(row, "show_dead") === 1,
  };
}

function parseUserRecord(row: Record<string, unknown>): UserRecord {
  return { ...parseUser(row), passwordHash: str(row, "password_hash") };
}

function parseStartup(row: Record<string, unknown>): Startup {
  const sourceRaw = str(row, "source");
  if (!isSource(sourceRaw)) throw new Error("bad source");
  return {
    id: str(row, "id"),
    slug: str(row, "slug"),
    name: str(row, "name"),
    description: str(row, "description"),
    url: str(row, "url"),
    domain: str(row, "domain"),
    source: sourceRaw,
    sourceId: strNull(row, "source_id"),
    createdAt: int(row, "created_at"),
  };
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

function parseLot(row: Record<string, unknown>): Lot {
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

const STARTUP_SELECT = `
  SELECT s.id, s.slug, s.name, s.description, s.url, s.domain, s.source, s.source_id, s.created_at
  FROM startups s
`;

export async function getUserById(id: string): Promise<User | null> {
  const row = await getRow("SELECT id, username, created_at, muted, show_dead FROM users WHERE id = ?", [id]);
  return row ? parseUser(row) : null;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const row = await getRow(
    "SELECT id, username, password_hash, created_at, muted, show_dead FROM users WHERE username = ? ",
    [username],
  );
  return row ? parseUserRecord(row) : null;
}

export async function createUser(input: { username: string; passwordHash: string }): Promise<User> {
  const id = randomUUID();
  const createdAt = Date.now();
  await run("INSERT INTO users (id, username, password_hash, created_at, muted, show_dead) VALUES (?, ?, ?, ?, 0, 0)", [
    id,
    input.username,
    input.passwordHash,
    createdAt,
  ]);
  return { id, username: input.username, createdAt, muted: false, showDead: false };
}

export const RATE_KINDS = ["register", "login", "submit", "comment", "vote", "book", "flag"] as const;
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
    ? await getRow(
        "SELECT COUNT(*) AS n FROM rate_log WHERE user_id = ? AND kind = ? AND created_at > ?",
        [filter.userId, filter.kind, filter.since],
      )
    : await getRow("SELECT COUNT(*) AS n FROM rate_log WHERE ip = ? AND kind = ? AND created_at > ?", [
        filter.ip ?? "",
        filter.kind,
        filter.since,
      ]);
  return row ? intish(row, "n") : 0;
}

export async function getStartupBySlug(slug: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.slug = ?`, [slug]);
  return row ? parseStartup(row) : null;
}

export async function getStartupById(id: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.id = ?`, [id]);
  return row ? parseStartup(row) : null;
}

export async function getStartupByDomain(domain: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.domain = ?`, [domain]);
  return row ? parseStartup(row) : null;
}

export async function getStartupByUrl(url: string): Promise<Startup | null> {
  const ident = identityFromUrl(url);
  if (ident) {
    const byDomain = await getStartupByDomain(ident.domain);
    if (byDomain) return byDomain;
  }
  const row = await getRow(`${STARTUP_SELECT} WHERE s.url = ?`, [url]);
  return row ? parseStartup(row) : null;
}

export async function getStartupBySource(source: Source, sourceId: string): Promise<Startup | null> {
  const row = await getRow(`${STARTUP_SELECT} WHERE s.source = ? AND s.source_id = ?`, [source, sourceId]);
  return row ? parseStartup(row) : null;
}

export async function countStartups(): Promise<number> {
  const row = await getRow("SELECT COUNT(*) AS n FROM startups");
  return row ? intish(row, "n") : 0;
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await getRow("SELECT 1 AS ok FROM startups WHERE slug = ?", [slug])) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export async function insertStartup(input: {
  name: string;
  description: string;
  url: string;
  source: Source;
  sourceId: string | null;
  createdAt: number;
}): Promise<Startup> {
  const ident = identityFromUrl(input.url);
  if (!ident) {
    const existingUrl = await getStartupByUrl(input.url);
    if (existingUrl) return existingUrl;
  } else {
    const existingDomain = await getStartupByDomain(ident.domain);
    if (existingDomain) return existingDomain;
  }
  if (input.sourceId) {
    const existingSource = await getStartupBySource(input.source, input.sourceId);
    if (existingSource) return existingSource;
  }
  const url = ident?.canonicalUrl ?? input.url;
  const domain = ident?.domain ?? url.toLowerCase();
  const existingUrl = await getRow(`${STARTUP_SELECT} WHERE s.url = ?`, [url]);
  if (existingUrl) return parseStartup(existingUrl);
  const id = randomUUID();
  const slug = await uniqueSlug(input.name);
  await run(
    `INSERT INTO startups (id, slug, name, description, url, domain, source, source_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, slug, input.name, input.description, url, domain, input.source, input.sourceId, input.createdAt],
  );
  return {
    id,
    slug,
    name: input.name,
    description: input.description,
    url,
    domain,
    source: input.source,
    sourceId: input.sourceId,
    createdAt: input.createdAt,
  };
}

export async function purgeHnStartups(): Promise<void> {
  await withTransaction(async () => {
    await run(
      `DELETE FROM comment_votes WHERE comment_id IN (
         SELECT id FROM comments WHERE startup_id IN (SELECT id FROM startups WHERE source = 'hn')
       )`,
    );
    await run("DELETE FROM comments WHERE startup_id IN (SELECT id FROM startups WHERE source = 'hn')");
    await run("DELETE FROM events WHERE startup_id IN (SELECT id FROM startups WHERE source = 'hn')");
    await run("DELETE FROM lots WHERE startup_id IN (SELECT id FROM startups WHERE source = 'hn')");
    await run("DELETE FROM positions WHERE startup_id IN (SELECT id FROM startups WHERE source = 'hn')");
    await run("DELETE FROM startups WHERE source = 'hn'");
  });
}

async function allStartups(): Promise<Startup[]> {
  return (await allRows(`${STARTUP_SELECT} ORDER BY s.created_at DESC`)).map(parseStartup);
}

async function toFeed(startups: Startup[], now: number): Promise<FeedItem[]> {
  const world = await loadWorld(now);
  return startups.map((startup) => ({
    ...startup,
    market: marketOf(world, startup.id),
  }));
}

export async function getMarket(startupId: string, now = Date.now()): Promise<Market> {
  const startup = await getStartupById(startupId);
  if (!startup) return emptyMarket();
  return marketOf(await loadWorld(now), startupId);
}

export async function listFeed(
  sort: Sort,
  page: number,
  now = Date.now(),
): Promise<{ items: FeedItem[]; total: number }> {
  const ranked = sortFeed(await toFeed(await allStartups(), now), sort, now);
  const start = (page - 1) * PAGE_SIZE;
  return { items: ranked.slice(start, start + PAGE_SIZE), total: ranked.length };
}

const DEAD_SQL = `(COALESCE(u.muted, 0) = 1 OR (COALESCE(fl.n, 0) >= ${FLAG_KILL} AND COALESCE(vh.n, 0) < COALESCE(fl.n, 0)))`;

const FLAG_JOINS = `
     LEFT JOIN (SELECT comment_id, COUNT(*) AS n FROM comment_flags GROUP BY comment_id) fl
       ON fl.comment_id = c.id
     LEFT JOIN (SELECT comment_id, COUNT(*) AS n FROM comment_vouches GROUP BY comment_id) vh
       ON vh.comment_id = c.id
     LEFT JOIN comment_flags myf ON myf.comment_id = c.id AND myf.user_id = ?
     LEFT JOIN comment_vouches myv ON myv.comment_id = c.id AND myv.user_id = ?`;

export async function listFrontComments(
  viewerId: string | null,
  page = 1,
  showDead = false,
): Promise<{ items: FrontComment[]; total: number }> {
  const voted = new Set<string>();
  if (viewerId) {
    for (const row of await allRows("SELECT comment_id FROM comment_votes WHERE user_id = ?", [viewerId])) {
      voted.add(str(row, "comment_id"));
    }
  }
  const who = viewerId ?? "";
  const deadOk = showDead ? 1 : 0;
  const visible = `AND (c.user_id = ? OR ? = 1 OR NOT ${DEAD_SQL})`;
  const totalRow = await getRow(
    `SELECT COUNT(*) AS n FROM comments c
     JOIN users u ON u.id = c.user_id
     ${FLAG_JOINS}
     WHERE c.parent_id IS NULL ${visible}`,
    [who, who, who, deadOk],
  );
  const total = totalRow ? intish(totalRow, "n") : 0;
  const start = (page - 1) * FRONT_PAGE;
  const rows = await allRows(
    `SELECT c.*, u.username, u.created_at AS author_created_at, s.slug AS startup_slug, s.name AS startup_name,
            COALESCE(v.points, 0) AS points, COALESCE(r.replies, 0) AS replies,
            p.direction AS p_direction, p.conviction AS p_conviction,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched
     FROM comments c
     JOIN users u ON u.id = c.user_id
     JOIN startups s ON s.id = c.startup_id
     LEFT JOIN positions p ON p.id = c.position_id
     LEFT JOIN (SELECT comment_id, COUNT(*) AS points FROM comment_votes GROUP BY comment_id) v
       ON v.comment_id = c.id
     LEFT JOIN (SELECT parent_id, COUNT(*) AS replies FROM comments WHERE parent_id IS NOT NULL GROUP BY parent_id) r
       ON r.parent_id = c.id
     ${FLAG_JOINS}
     WHERE c.parent_id IS NULL ${visible}
     ORDER BY points DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [who, who, who, deadOk, FRONT_PAGE, start],
  );
  return {
    items: rows.map((row) => ({
      ...hydrateComment(row, viewerId, voted),
      startupSlug: str(row, "startup_slug"),
      startupName: str(row, "startup_name"),
      replies: intish(row, "replies"),
    })),
    total,
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
  return (await allRows(
    `SELECT e.*, u.username
     FROM events e JOIN users u ON u.id = e.user_id
     WHERE e.startup_id = ?
     ORDER BY e.created_at DESC`,
    [startupId],
  )).map(parseEvent);
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

export async function movesUsed(userId: string, at = Date.now()): Promise<number> {
  const row = await getRow("SELECT n FROM moves WHERE user_id = ? AND day = ?", [userId, utcDay(at)]);
  return row ? int(row, "n") : 0;
}

export async function movesLeft(userId: string, at = Date.now()): Promise<number> {
  return Math.max(0, MOVES_PER_DAY - await movesUsed(userId, at));
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
  await run(
    `INSERT INTO comments (id, startup_id, user_id, parent_id, position_id, text, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    [randomUUID(), input.startupId, input.userId, input.positionId, input.text, input.at],
  );
}

async function openLots(positionId: string): Promise<Lot[]> {
  return (await allRows(
    `SELECT * FROM lots WHERE position_id = ? AND closed_at IS NULL ORDER BY opened_at DESC`,
    [positionId],
  )).map(parseLot);
}

async function snapshot(
  startupId: string,
  at: number,
): Promise<{ pulse: number; p: number; depth: number }> {
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

async function realizeLot(lot: Lot, amount: number, at: number): Promise<void> {
  const world = await loadWorld(at);
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

async function decreaseLots(positionId: string, amount: number, at: number): Promise<void> {
  let left = amount;
  for (const lot of await openLots(positionId)) {
    if (left <= 0) break;
    const take = Math.min(lot.conviction, left);
    await realizeLot(lot, take, at);
    left -= take;
  }
}

async function closeAllLots(positionId: string, at: number): Promise<void> {
  for (const lot of await openLots(positionId)) await realizeLot(lot, lot.conviction, at);
}

export async function applyBookChange(input: {
  startupId: string;
  userId: string;
  direction: Direction;
  conviction: number;
  note: string;
  close?: boolean;
}): Promise<EventKind> {
  const at = Date.now();
  if (!Number.isInteger(input.conviction) || input.conviction < 0 || input.conviction > CONVICTION_CAP) {
    throw new BookError("Conviction must be an integer from 0 to 100.");
  }
  return await withTransaction(async () => {
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
      await run(
        "UPDATE positions SET direction = ?, conviction = ?, note = ?, updated_at = ? WHERE id = ?",
        [input.direction, input.conviction, input.note, at, current.id],
      );
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
  });
}

export async function getCommentById(id: string, viewerId: string | null = null): Promise<Comment | null> {
  const who = viewerId ?? "";
  const row = await getRow(
    `SELECT c.*, u.username, u.created_at AS author_created_at, COALESCE(v.points, 0) AS points,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched,
            p.direction AS p_direction, p.conviction AS p_conviction
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN positions p ON p.id = c.position_id
     LEFT JOIN (SELECT comment_id, COUNT(*) AS points FROM comment_votes GROUP BY comment_id) v
       ON v.comment_id = c.id
     ${FLAG_JOINS}
     WHERE c.id = ?`,
    [who, who, id],
  );
  if (!row) return null;
  return hydrateComment(row, viewerId, new Set());
}

function hydrateComment(row: Record<string, unknown>, viewerId: string | null, voted: Set<string>): Comment {
  const id = str(row, "id");
  const userId = str(row, "user_id");
  const positionId = strNull(row, "position_id");
  let position: Comment["position"] = null;
  if (positionId) {
    const directionRaw = strNull(row, "p_direction");
    const conv = intNull(row, "p_conviction");
    if (directionRaw && isDirection(directionRaw) && conv !== null) {
      position = { direction: directionRaw, conviction: conv };
    }
  }
  return {
    id,
    startupId: str(row, "startup_id"),
    userId,
    username: str(row, "username"),
    parentId: strNull(row, "parent_id"),
    positionId,
    text: str(row, "text"),
    createdAt: int(row, "created_at"),
    points: intish(row, "points"),
    voted: voted.has(id),
    own: viewerId === userId,
    dead: intish(row, "dead") === 1,
    flagged: intish(row, "flagged") === 1,
    vouched: intish(row, "vouched") === 1,
    authorCreatedAt: int(row, "author_created_at"),
    position,
  };
}

export async function listThread(
  startupId: string,
  viewerId: string | null,
  showDead = false,
): Promise<ThreadNode[]> {
  const voted = new Set<string>();
  if (viewerId) {
    for (const row of await allRows(
      `SELECT v.comment_id FROM comment_votes v
       JOIN comments c ON c.id = v.comment_id
       WHERE v.user_id = ? AND c.startup_id = ?`,
      [viewerId, startupId],
    )) {
      voted.add(str(row, "comment_id"));
    }
  }
  const who = viewerId ?? "";
  const deadOk = showDead ? 1 : 0;
  const rows = await allRows(
    `SELECT c.*, u.username, u.created_at AS author_created_at, COALESCE(v.points, 0) AS points,
            p.direction AS p_direction, p.conviction AS p_conviction,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN positions p ON p.id = c.position_id AND p.closed_at IS NULL
     LEFT JOIN (SELECT comment_id, COUNT(*) AS points FROM comment_votes GROUP BY comment_id) v
       ON v.comment_id = c.id
     ${FLAG_JOINS}
     WHERE c.startup_id = ? AND (c.user_id = ? OR ? = 1 OR NOT ${DEAD_SQL})
     ORDER BY c.created_at ASC`,
    [who, who, startupId, who, deadOk],
  );
  const nodes = new Map<string, ThreadNode>();
  const roots: ThreadNode[] = [];
  for (const row of rows) {
    const comment = hydrateComment(row, viewerId, voted);
    nodes.set(comment.id, { ...comment, kids: [] });
  }
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.kids.push(node);
    else if (!node.parentId) roots.push(node);
  }
  roots.sort((a, b) => b.points - a.points || b.createdAt - a.createdAt);
  return roots;
}

export async function insertReply(input: {
  startupId: string;
  userId: string;
  parentId: string;
  text: string;
}): Promise<Comment> {
  const parent = await getCommentById(input.parentId);
  if (!parent || parent.startupId !== input.startupId) {
    throw new Error("parent missing");
  }
  const id = randomUUID();
  const createdAt = Date.now();
  await run(
    `INSERT INTO comments (id, startup_id, user_id, parent_id, position_id, text, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [id, input.startupId, input.userId, input.parentId, input.text, createdAt],
  );
  const user = await getUserById(input.userId);
  return {
    id,
    startupId: input.startupId,
    userId: input.userId,
    username: user?.username ?? "",
    parentId: input.parentId,
    positionId: null,
    text: input.text,
    createdAt,
    points: 0,
    voted: false,
    own: true,
    dead: false,
    flagged: false,
    vouched: false,
    authorCreatedAt: user?.createdAt ?? createdAt,
    position: null,
  };
}

export async function setVote(commentId: string, userId: string, want: boolean): Promise<void> {
  const comment = await getCommentById(commentId);
  if (!comment) throw new Error("missing comment");
  if (comment.userId === userId) throw new Error("own comment");
  await withTransaction(async () => {
    const existing = await getRow(
      "SELECT 1 AS ok FROM comment_votes WHERE comment_id = ? AND user_id = ?",
      [commentId, userId],
    );
    if (want && !existing) {
      await run("INSERT INTO comment_votes (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
        commentId,
        userId,
        Date.now(),
      ]);
    } else if (!want && existing) {
      await run("DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?", [commentId, userId]);
    }
  });
}

export async function toggleFlag(commentId: string, userId: string): Promise<void> {
  const comment = await getCommentById(commentId, userId);
  if (!comment) throw new Error("missing comment");
  if (comment.userId === userId) throw new Error("own comment");
  if (comment.flagged) {
    await run("DELETE FROM comment_flags WHERE comment_id = ? AND user_id = ?", [commentId, userId]);
    return;
  }
  await run("INSERT INTO comment_flags (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
    commentId,
    userId,
    Date.now(),
  ]);
}

export async function toggleVouch(commentId: string, userId: string): Promise<void> {
  const comment = await getCommentById(commentId, userId);
  if (!comment) throw new Error("missing comment");
  if (comment.userId === userId) throw new Error("own comment");
  if (!comment.dead && !comment.vouched) throw new Error("not dead");
  if (comment.vouched) {
    await run("DELETE FROM comment_vouches WHERE comment_id = ? AND user_id = ?", [commentId, userId]);
    return;
  }
  await run("INSERT INTO comment_vouches (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
    commentId,
    userId,
    Date.now(),
  ]);
}

export async function setShowDead(userId: string, on: boolean): Promise<void> {
  await run("UPDATE users SET show_dead = ? WHERE id = ?", [on ? 1 : 0, userId]);
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await getRow("SELECT value FROM meta WHERE key = ?", [key]);
  return row ? str(row, "value") : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    key,
    value,
  ]);
}

export async function getStartupsByIds(ids: string[]): Promise<Map<string, Startup>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await allRows(`${STARTUP_SELECT} WHERE s.id IN (${placeholders})`, ids);
  const map = new Map<string, Startup>();
  for (const row of rows) {
    const startup = parseStartup(row);
    map.set(startup.id, startup);
  }
  return map;
}

function safeLike(term: string): string {
  return `%${term.replace(/[%_\\]/g, "")}%`;
}

export async function lookupStartups(q: string): Promise<LookupHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const ident = identityFromUrl(trimmed);
  const exact = ident ? await getStartupByDomain(ident.domain) : null;
  const needle = ident?.domain ?? trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const like = safeLike(needle.toLowerCase());
  const rows = await allRows(
    `${STARTUP_SELECT}
     WHERE s.domain ILIKE ? 
        OR s.name ILIKE ? 
        OR s.url ILIKE ? 
     ORDER BY LOWER(s.name)
     LIMIT 8`,
    [like, like, like],
  );
  const hits: LookupHit[] = [];
  const seen = new Set<string>();
  if (exact) {
    hits.push({
      slug: exact.slug,
      name: exact.name,
      description: exact.description,
      domain: exact.domain,
      url: exact.url,
      exact: true,
    });
    seen.add(exact.id);
  }
  for (const row of rows) {
    const startup = parseStartup(row);
    if (seen.has(startup.id)) continue;
    hits.push({
      slug: startup.slug,
      name: startup.name,
      description: startup.description,
      domain: startup.domain,
      url: startup.url,
      exact: ident?.domain === startup.domain,
    });
    seen.add(startup.id);
  }
  return hits.slice(0, 8);
}

async function lineFrom(
  position: Position,
  startup: Startup,
  lots: Lot[],
  world: World,
): Promise<BookLine> {
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
  const positions = (await allRows(
    `SELECT p.*, u.username
     FROM positions p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = ? AND p.closed_at IS NULL
     ORDER BY p.conviction DESC, p.opened_at ASC`,
    [userId],
  )).map(parsePosition);
  const startups = await getStartupsByIds(positions.map((p) => p.startupId));
  const lotsByPosition = new Map<string, Lot[]>();
  for (const lot of (await allRows("SELECT * FROM lots WHERE user_id = ? AND closed_at IS NULL", [userId])).map(parseLot)) {
    const list = lotsByPosition.get(lot.positionId) ?? [];
    list.push(lot);
    lotsByPosition.set(lot.positionId, list);
  }
  const world = await loadWorld(now);
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
  return await lineFrom(position, startup, lots, await loadWorld(now));
}

export async function listUserReceipts(userId: string): Promise<Receipt[]> {
  const lots = (await allRows("SELECT * FROM lots WHERE user_id = ? ORDER BY opened_at ASC", [userId])).map(parseLot);
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
    const market = marketOf(await loadWorld(closedAt), first.startupId);
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

type VoteIn = { voterId: string; at: number };
type VoteOut = { authorId: string; at: number };

function scoreKarma(world: World, userId: string, received: VoteIn[], given: VoteOut[]): number {
  const pairGranted: VoteIn[] = [];
  const dayGranted = new Map<string, number>();
  let karma = 0;
  for (const vote of received) {
    if (vote.voterId === userId) continue;
    if (!accounted(world, vote.voterId, vote.at)) continue;
    const reciprocal = given.some(
      (givenVote) =>
        givenVote.authorId === vote.voterId &&
        vote.at - givenVote.at >= 0 &&
        vote.at - givenVote.at < KARMA_PAIR_WINDOW_MS,
    );
    if (reciprocal) continue;
    const pairCount = pairGranted.filter(
      (granted) => granted.voterId === vote.voterId && vote.at - granted.at < KARMA_PAIR_WINDOW_MS,
    ).length;
    if (pairCount >= KARMA_PAIR_CAP) continue;
    const day = utcDay(vote.at);
    const today = dayGranted.get(day) ?? 0;
    if (today >= KARMA_DAY_CAP) continue;
    pairGranted.push(vote);
    dayGranted.set(day, today + 1);
    karma += 1;
  }
  return karma;
}

function alphaFromLots(world: World, userId: string, lots: Lot[]): number {
  const byStartup = new Map<string, Lot[]>();
  for (const lot of lots) {
    const list = byStartup.get(lot.startupId) ?? [];
    list.push(lot);
    byStartup.set(lot.startupId, list);
  }
  let total = 0;
  for (const [startupId, group] of byStartup) {
    total += scoreLots(world, startupId, userId, group).total;
  }
  return total;
}

function rankLeaders(
  rows: { userId: string; username: string; alpha: number; karma: number }[],
  compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number,
  limit: number,
): Leader[] {
  return [...rows]
    .sort(compare)
    .slice(0, limit)
    .map((row, index) => ({
      userId: row.userId,
      username: row.username,
      alpha: row.alpha,
      karma: row.karma,
      rank: index + 1,
    }));
}

export async function getKarma(userId: string, now = Date.now()): Promise<number> {
  const world = await loadWorld(now);
  const received = (await allRows(
    `SELECT v.user_id AS voter_id, v.created_at
     FROM comment_votes v
     JOIN comments c ON c.id = v.comment_id
     WHERE c.user_id = ?
     ORDER BY v.created_at ASC`,
    [userId],
  )).map((row) => ({ voterId: str(row, "voter_id"), at: int(row, "created_at") }));
  const given = (await allRows(
    `SELECT c.user_id AS author_id, v.created_at
     FROM comment_votes v
     JOIN comments c ON c.id = v.comment_id
     WHERE v.user_id = ?`,
    [userId],
  )).map((row) => ({ authorId: str(row, "author_id"), at: int(row, "created_at") }));
  return scoreKarma(world, userId, received, given);
}

export async function getPlayerAlpha(userId: string, now = Date.now(), world?: World): Promise<number> {
  const resolved = world ?? (await loadWorld(now));
  return alphaFromLots(resolved, userId, (await allRows("SELECT * FROM lots WHERE user_id = ?", [userId])).map(parseLot));
}

export async function listLeaders(now = Date.now(), limit = PAGE_SIZE): Promise<Leaderboard> {
  const world = await loadWorld(now);
  const users = (await allRows("SELECT id, username FROM users")).map((row) => ({
    id: str(row, "id"),
    username: str(row, "username"),
  }));
  const lotsByUser = new Map<string, Lot[]>();
  for (const lot of (await allRows("SELECT * FROM lots")).map(parseLot)) {
    const list = lotsByUser.get(lot.userId) ?? [];
    list.push(lot);
    lotsByUser.set(lot.userId, list);
  }
  const receivedBy = new Map<string, VoteIn[]>();
  const givenBy = new Map<string, VoteOut[]>();
  for (const row of await allRows(
    `SELECT v.user_id AS voter_id, v.created_at, c.user_id AS author_id
     FROM comment_votes v
     JOIN comments c ON c.id = v.comment_id
     ORDER BY v.created_at ASC`,
  )) {
    const voterId = str(row, "voter_id");
    const authorId = str(row, "author_id");
    const at = int(row, "created_at");
    const received = receivedBy.get(authorId) ?? [];
    received.push({ voterId, at });
    receivedBy.set(authorId, received);
    const given = givenBy.get(voterId) ?? [];
    given.push({ authorId, at });
    givenBy.set(voterId, given);
  }
  const scored = users.map((user) => {
    const lots = lotsByUser.get(user.id) ?? [];
    return {
      userId: user.id,
      username: user.username,
      alpha: lots.length > 0 ? alphaFromLots(world, user.id, lots) : 0,
      karma: scoreKarma(world, user.id, receivedBy.get(user.id) ?? [], givenBy.get(user.id) ?? []),
      hasLots: lots.length > 0,
    };
  });
  return {
    alpha: rankLeaders(
      scored.filter((row) => row.hasLots),
      (a, b) => b.alpha - a.alpha || b.karma - a.karma || a.username.localeCompare(b.username),
      limit,
    ),
    karma: rankLeaders(
      scored.filter((row) => row.karma > 0),
      (a, b) => b.karma - a.karma || b.alpha - a.alpha || a.username.localeCompare(b.username),
      limit,
    ),
  };
}

export async function getPlayerStats(userId: string, now = Date.now()): Promise<PlayerStats> {
  return {
    alpha: await getPlayerAlpha(userId, now),
    karma: await getKarma(userId),
    deployed: await countDeployed(userId),
    movesLeft: await movesLeft(userId, now),
  };
}

export async function countPlayers(): Promise<number> {
  const row = await getRow("SELECT COUNT(DISTINCT user_id) AS n FROM lots");
  return row ? intish(row, "n") : 0;
}

export async function alphaRank(userId: string, now = Date.now()): Promise<number> {
  const players = (await allRows("SELECT DISTINCT user_id FROM lots")).map((row) => str(row, "user_id"));
  if (players.length === 0) return 50;
  const world = await loadWorld(now);
  const scores = await Promise.all(
    players.map(async (id) => ({ id, alpha: await getPlayerAlpha(id, now, world) })),
  );
  scores.sort((a, b) => b.alpha - a.alpha);
  const index = scores.findIndex((row) => row.id === userId);
  if (index < 0) return 50;
  return ((index + 1) / scores.length) * 100;
}
