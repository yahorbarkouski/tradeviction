// Alpha and Karma per player, and the boards that rank them.
import { cacheLife, cacheTag } from "next/cache";
import { allRows } from "@/lib/db";
import { countDeployed, parseLot } from "@/lib/db/book";
import { int, str } from "@/lib/db/codec";
import { accounted, cachedWorld, scoreLots, type World } from "@/lib/engine";
import { KARMA_DAY_CAP, KARMA_PAIR_CAP, KARMA_PAIR_WINDOW_MS, utcDay } from "@/lib/market";
import { TAG } from "@/lib/tags";
import type { Leader, Leaderboard, Lot, PlayerStats } from "@/lib/types";

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

// Votes by who received and who gave them, from rows of voter_id, author_id,
// and created_at in time order.
function indexVotes(rows: Record<string, unknown>[]): {
  receivedBy: Map<string, VoteIn[]>;
  givenBy: Map<string, VoteOut[]>;
} {
  const receivedBy = new Map<string, VoteIn[]>();
  const givenBy = new Map<string, VoteOut[]>();
  for (const row of rows) {
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
  return { receivedBy, givenBy };
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
  const [world, receivedRows, givenRows] = await Promise.all([
    cachedWorld(now),
    allRows(
      `SELECT v.user_id AS voter_id, v.created_at
       FROM comment_votes v
       JOIN comments c ON c.id = v.comment_id
       WHERE c.user_id = ?
       ORDER BY v.created_at ASC`,
      [userId],
    ),
    allRows(
      `SELECT c.user_id AS author_id, v.created_at
       FROM comment_votes v
       JOIN comments c ON c.id = v.comment_id
       WHERE v.user_id = ?`,
      [userId],
    ),
  ]);
  const received = receivedRows.map((row) => ({ voterId: str(row, "voter_id"), at: int(row, "created_at") }));
  const given = givenRows.map((row) => ({ authorId: str(row, "author_id"), at: int(row, "created_at") }));
  return scoreKarma(world, userId, received, given);
}

export async function getPlayerAlpha(userId: string, now = Date.now(), world?: World): Promise<number> {
  const [resolved, lotRows] = await Promise.all([
    world ?? cachedWorld(now),
    allRows("SELECT * FROM lots WHERE user_id = ?", [userId]),
  ]);
  return alphaFromLots(resolved, userId, lotRows.map(parseLot));
}

// How many names each board on /top shows.
const LEADERBOARD_SIZE = 30;

export async function listLeaders(now = Date.now(), limit = LEADERBOARD_SIZE): Promise<Leaderboard> {
  const world = await cachedWorld(now);
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
  const { receivedBy, givenBy } = indexVotes(
    await allRows(
      `SELECT v.user_id AS voter_id, v.created_at, c.user_id AS author_id
       FROM comment_votes v
       JOIN comments c ON c.id = v.comment_id
       ORDER BY v.created_at ASC`,
    ),
  );
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

export async function cachedLeaders(): Promise<Leaderboard> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.world, TAG.leaders);
  return listLeaders(Date.now());
}

export type PlayerScore = { alpha: number; karma: number; played: boolean };

// Alpha and karma for a chosen set of users from one lots read and one votes
// read, for boards that rank a group rather than the whole site.
export async function scorePlayers(userIds: string[], now = Date.now()): Promise<Map<string, PlayerScore>> {
  const scores = new Map<string, PlayerScore>();
  if (userIds.length === 0) return scores;
  const ph = userIds.map(() => "?").join(",");
  const [world, lotRows, voteRows] = await Promise.all([
    cachedWorld(now),
    allRows(`SELECT * FROM lots WHERE user_id IN (${ph})`, userIds),
    allRows(
      `SELECT v.user_id AS voter_id, v.created_at, c.user_id AS author_id
       FROM comment_votes v
       JOIN comments c ON c.id = v.comment_id
       WHERE c.user_id IN (${ph}) OR v.user_id IN (${ph})
       ORDER BY v.created_at ASC`,
      [...userIds, ...userIds],
    ),
  ]);
  const lotsByUser = new Map<string, Lot[]>();
  for (const lot of lotRows.map(parseLot)) {
    const list = lotsByUser.get(lot.userId) ?? [];
    list.push(lot);
    lotsByUser.set(lot.userId, list);
  }
  const { receivedBy, givenBy } = indexVotes(voteRows);
  for (const id of userIds) {
    const lots = lotsByUser.get(id) ?? [];
    scores.set(id, {
      alpha: lots.length > 0 ? alphaFromLots(world, id, lots) : 0,
      karma: scoreKarma(world, id, receivedBy.get(id) ?? [], givenBy.get(id) ?? []),
      played: lots.length > 0,
    });
  }
  return scores;
}

export async function getPlayerStats(userId: string, now = Date.now()): Promise<PlayerStats> {
  const world = await cachedWorld(now);
  const [alpha, karma, deployed] = await Promise.all([
    getPlayerAlpha(userId, now, world),
    getKarma(userId, now),
    countDeployed(userId),
  ]);
  return { alpha, karma, deployed, established: accounted(world, userId, now) };
}

export async function alphaRank(userId: string, now = Date.now()): Promise<number> {
  const players = (await allRows("SELECT DISTINCT user_id FROM lots")).map((row) => str(row, "user_id"));
  if (players.length === 0) return 50;
  const world = await cachedWorld(now);
  const scores = await Promise.all(players.map(async (id) => ({ id, alpha: await getPlayerAlpha(id, now, world) })));
  scores.sort((a, b) => b.alpha - a.alpha);
  const index = scores.findIndex((row) => row.id === userId);
  if (index < 0) return 50;
  return ((index + 1) / scores.length) * 100;
}
