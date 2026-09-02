// Comments: takes (the root comment a position opens with), replies, votes,
// flags, and vouches. Points count clicks; score weighs them by the voter's
// standing, which is what ranks the front page and decides what is dead.
import { randomUUID } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intNull, intish, numNull, str, strNull } from "@/lib/db/codec";
import { ELIGIBLE_AGE_MS, ELIGIBLE_STARTUPS, FLAG_KILL, PROVISIONAL_WEIGHT, RANK_HALF_LIFE_MS } from "@/lib/market";
import { TAG, startupTag } from "@/lib/tags";
import { isDirection, type Comment, type FrontComment, type ThreadNode } from "@/lib/types";

export const FRONT_PAGE = 40;

// One row per user with the weight a vote from them carries in rankings.
// Mirrors accounted() in lib/engine.ts: muted 0; trusted or X-verified 1;
// established 1, meaning old enough, three startups touched, and upvoted at
// least once by a trusted or verified member; everyone else provisional.
// Takes one param: the created_at cutoff for age.
const VOTER_CTE = `
  WITH touched AS (
    SELECT user_id, COUNT(DISTINCT startup_id) AS n FROM (
      SELECT user_id, startup_id FROM positions
      UNION
      SELECT user_id, startup_id FROM comments
    ) t
    GROUP BY user_id
  ),
  endorsed AS (
    SELECT DISTINCT c.user_id
    FROM comment_votes cv
    JOIN comments c ON c.id = cv.comment_id
    JOIN users e ON e.id = cv.user_id
    WHERE e.id <> c.user_id
      AND COALESCE(e.muted, 0) = 0
      AND (COALESCE(e.trusted, 0) = 1 OR COALESCE(e.x_verified, 0) = 1)
  ),
  voter AS (
    SELECT u.id,
           CASE
             WHEN COALESCE(u.muted, 0) = 1 THEN 0
             WHEN COALESCE(u.trusted, 0) = 1 OR COALESCE(u.x_verified, 0) = 1 THEN 1
             WHEN u.created_at <= ? AND COALESCE(t.n, 0) >= ${ELIGIBLE_STARTUPS} AND en.user_id IS NOT NULL THEN 1
             ELSE ${PROVISIONAL_WEIGHT}
           END AS weight
    FROM users u
    LEFT JOIN touched t ON t.user_id = u.id
    LEFT JOIN endorsed en ON en.user_id = u.id
  )`;

function voterCutoff(now: number): number {
  return now - ELIGIBLE_AGE_MS;
}

const DEAD_SQL = `(COALESCE(u.muted, 0) = 1
  OR (COALESCE(fl.n, 0) >= GREATEST(${FLAG_KILL}, CEIL(COALESCE(v.score, 0) / 2.0))
      AND COALESCE(vh.n, 0) < COALESCE(fl.n, 0)))`;

// points: how many unmuted accounts clicked. score: those clicks weighted by voter.
const POINT_JOINS = `
     LEFT JOIN (
       SELECT cv.comment_id,
              COUNT(*) FILTER (WHERE w.weight > 0) AS points,
              SUM(w.weight) AS score
       FROM comment_votes cv
       JOIN voter w ON w.id = cv.user_id
       GROUP BY cv.comment_id
     ) v ON v.comment_id = c.id
     LEFT JOIN (
       SELECT f.comment_id, COUNT(*) AS n
       FROM comment_flags f
       JOIN users fu ON fu.id = f.user_id AND COALESCE(fu.muted, 0) = 0
       GROUP BY f.comment_id
     ) fl ON fl.comment_id = c.id
     LEFT JOIN (
       SELECT x.comment_id, COUNT(*) AS n
       FROM comment_vouches x
       JOIN users xu ON xu.id = x.user_id AND COALESCE(xu.muted, 0) = 0
       GROUP BY x.comment_id
     ) vh ON vh.comment_id = c.id
     LEFT JOIN comment_flags myf ON myf.comment_id = c.id AND myf.user_id = ?
     LEFT JOIN comment_vouches myv ON myv.comment_id = c.id AND myv.user_id = ?`;

const RANK_SQL = `COALESCE(v.score, 0)::float8 * POWER(0.5::float8, (? - c.created_at)::float8 / ${RANK_HALF_LIFE_MS})`;

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
    score: numNull(row, "score") ?? 0,
    voted: voted.has(id),
    own: viewerId === userId,
    dead: intish(row, "dead") === 1,
    flagged: intish(row, "flagged") === 1,
    vouched: intish(row, "vouched") === 1,
    authorCreatedAt: int(row, "author_created_at"),
    authorVerified: intish(row, "author_verified") === 1,
    position,
  };
}

export async function getCommentById(
  id: string,
  viewerId: string | null = null,
  now = Date.now(),
): Promise<Comment | null> {
  const who = viewerId ?? "";
  const row = await getRow(
    `${VOTER_CTE}
     SELECT c.*, u.username, u.created_at AS author_created_at, u.x_verified AS author_verified,
            COALESCE(v.points, 0) AS points, COALESCE(v.score, 0) AS score,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched,
            p.direction AS p_direction, p.conviction AS p_conviction
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN positions p ON p.id = c.position_id
     ${POINT_JOINS}
     WHERE c.id = ?`,
    [voterCutoff(now), who, who, id],
  );
  if (!row) return null;
  return hydrateComment(row, viewerId, new Set());
}

export async function listFrontComments(
  viewerId: string | null,
  page = 1,
  showDead = false,
  now = Date.now(),
): Promise<{ items: FrontComment[]; total: number }> {
  const voted = new Set<string>();
  if (viewerId) {
    for (const row of await allRows("SELECT comment_id FROM comment_votes WHERE user_id = ?", [viewerId])) {
      voted.add(str(row, "comment_id"));
    }
  }
  const who = viewerId ?? "";
  const deadOk = showDead ? 1 : 0;
  const cutoff = voterCutoff(now);
  const visible = `AND (c.user_id = ? OR ? = 1 OR NOT ${DEAD_SQL})`;
  const totalRow = await getRow(
    `${VOTER_CTE}
     SELECT COUNT(*) AS n FROM comments c
     JOIN users u ON u.id = c.user_id
     ${POINT_JOINS}
     WHERE c.parent_id IS NULL ${visible}`,
    [cutoff, who, who, who, deadOk],
  );
  const total = totalRow ? intish(totalRow, "n") : 0;
  const start = (page - 1) * FRONT_PAGE;
  const rows = await allRows(
    `${VOTER_CTE}
     SELECT c.*, u.username, u.created_at AS author_created_at, u.x_verified AS author_verified, s.slug AS startup_slug, s.name AS startup_name,
            COALESCE(v.points, 0) AS points, COALESCE(v.score, 0) AS score, COALESCE(r.replies, 0) AS replies,
            p.direction AS p_direction, p.conviction AS p_conviction,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched
     FROM comments c
     JOIN users u ON u.id = c.user_id
     JOIN startups s ON s.id = c.startup_id
     JOIN voter aw ON aw.id = c.user_id
     LEFT JOIN positions p ON p.id = c.position_id
     LEFT JOIN (SELECT parent_id, COUNT(*) AS replies FROM comments WHERE parent_id IS NOT NULL GROUP BY parent_id) r
       ON r.parent_id = c.id
     ${POINT_JOINS}
     WHERE c.parent_id IS NULL ${visible}
     ORDER BY ${RANK_SQL} DESC, aw.weight DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [cutoff, who, who, who, deadOk, now, FRONT_PAGE, start],
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

// The front page as everyone sees it: no viewer, dead rows included and marked,
// so one entry serves every session. Rows overlay the viewer's marks on the client.
export async function cachedFrontPage(page: number): Promise<{ items: FrontComment[]; total: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAG.front, TAG.threads);
  return listFrontComments(null, page, true, Date.now());
}

export async function listThread(
  startupId: string,
  viewerId: string | null,
  showDead = false,
  now = Date.now(),
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
    `${VOTER_CTE}
     SELECT c.*, u.username, u.created_at AS author_created_at, u.x_verified AS author_verified,
            COALESCE(v.points, 0) AS points, COALESCE(v.score, 0) AS score,
            p.direction AS p_direction, p.conviction AS p_conviction,
            CASE WHEN ${DEAD_SQL} THEN 1 ELSE 0 END AS dead,
            CASE WHEN myf.user_id IS NULL THEN 0 ELSE 1 END AS flagged,
            CASE WHEN myv.user_id IS NULL THEN 0 ELSE 1 END AS vouched
     FROM comments c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN positions p ON p.id = c.position_id AND p.closed_at IS NULL
     ${POINT_JOINS}
     WHERE c.startup_id = ? AND (c.user_id = ? OR ? = 1 OR NOT ${DEAD_SQL})
     ORDER BY c.created_at ASC`,
    [voterCutoff(now), who, who, startupId, who, deadOk],
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
  roots.sort((a, b) => b.score - a.score || b.points - a.points || b.createdAt - a.createdAt);
  return roots;
}

// One thread for everyone, dead comments included and marked, shared across
// sessions. Viewer marks overlay on the client.
export async function cachedThread(startupId: string): Promise<ThreadNode[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(TAG.threads, startupTag(startupId));
  return listThread(startupId, null, true, Date.now());
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
  const author = await getRow("SELECT username, created_at, x_verified FROM users WHERE id = ?", [input.userId]);
  return {
    id,
    startupId: input.startupId,
    userId: input.userId,
    username: author ? str(author, "username") : "",
    parentId: input.parentId,
    positionId: null,
    text: input.text,
    createdAt,
    points: 0,
    score: 0,
    voted: false,
    own: true,
    dead: false,
    flagged: false,
    vouched: false,
    authorCreatedAt: author ? int(author, "created_at") : createdAt,
    authorVerified: author ? intish(author, "x_verified") === 1 : false,
    position: null,
  };
}

export async function setVote(commentId: string, userId: string, want: boolean): Promise<void> {
  const comment = await getCommentById(commentId);
  if (!comment) throw new Error("missing comment");
  if (comment.userId === userId) throw new Error("own comment");
  await withTransaction(async () => {
    const existing = await getRow("SELECT 1 AS ok FROM comment_votes WHERE comment_id = ? AND user_id = ?", [
      commentId,
      userId,
    ]);
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

export async function updateComment(id: string, text: string): Promise<Comment | null> {
  await run("UPDATE comments SET text = ? WHERE id = ?", [text, id]);
  return await getCommentById(id);
}

export async function eraseCommentRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ph = ids.map(() => "?").join(",");
  await run(`DELETE FROM comment_votes WHERE comment_id IN (${ph})`, ids);
  await run(`DELETE FROM comment_flags WHERE comment_id IN (${ph})`, ids);
  await run(`DELETE FROM comment_vouches WHERE comment_id IN (${ph})`, ids);
  await run(`UPDATE comments SET parent_id = NULL WHERE id IN (${ph})`, ids);
  await run(`DELETE FROM comments WHERE id IN (${ph})`, ids);
}

// A take's text also sits on the position and on the events that carried it,
// which the profile and the moves log show. Deleting the take clears those too.
async function eraseTakeText(comment: Comment): Promise<void> {
  if (comment.parentId !== null || comment.positionId === null) return;
  await run("UPDATE positions SET note = '' WHERE id = ? AND note = ?", [comment.positionId, comment.text]);
  await run("UPDATE events SET note = NULL WHERE user_id = ? AND startup_id = ? AND note = ?", [
    comment.userId,
    comment.startupId,
    comment.text,
  ]);
}

export async function deleteCommentTree(id: string): Promise<string | null> {
  return await withTransaction(async () => {
    const root = await getCommentById(id);
    if (!root) return null;
    const rows = await allRows(
      `WITH RECURSIVE tree AS (
         SELECT id FROM comments WHERE id = ?
         UNION ALL
         SELECT c.id FROM comments c INNER JOIN tree t ON c.parent_id = t.id
       )
       SELECT id FROM tree`,
      [id],
    );
    await eraseTakeText(root);
    await eraseCommentRows(rows.map((row) => str(row, "id")));
    return root.startupId;
  });
}

// An author removes one comment of their own. Replies by other people stay,
// attached to the next living ancestor, the same way deleteUser leaves them.
// Returns the startup id, or null when the comment is missing or not theirs.
export async function deleteOwnComment(userId: string, id: string): Promise<string | null> {
  return await withTransaction(async () => {
    const comment = await getCommentById(id);
    if (!comment || comment.userId !== userId) return null;
    await run("UPDATE comments SET parent_id = ? WHERE parent_id = ?", [comment.parentId, id]);
    await eraseTakeText(comment);
    await eraseCommentRows([id]);
    return comment.startupId;
  });
}

// Comment ids the user voted for, flagged, and vouched for.
export async function listViewerMarks(
  userId: string,
): Promise<{ voted: string[]; flagged: string[]; vouched: string[] }> {
  const rows = await allRows(
    `SELECT 'voted' AS kind, comment_id FROM comment_votes WHERE user_id = ?
     UNION ALL
     SELECT 'flagged' AS kind, comment_id FROM comment_flags WHERE user_id = ?
     UNION ALL
     SELECT 'vouched' AS kind, comment_id FROM comment_vouches WHERE user_id = ?`,
    [userId, userId, userId],
  );
  const marks = { voted: [] as string[], flagged: [] as string[], vouched: [] as string[] };
  for (const row of rows) {
    const kind = str(row, "kind");
    const id = str(row, "comment_id");
    if (kind === "voted") marks.voted.push(id);
    else if (kind === "flagged") marks.flagged.push(id);
    else if (kind === "vouched") marks.vouched.push(id);
  }
  return marks;
}

// The root take a position was opened with, when its note was not empty.
export async function getTakeCommentId(positionId: string): Promise<string | null> {
  const row = await getRow(
    "SELECT id FROM comments WHERE position_id = ? AND parent_id IS NULL ORDER BY created_at ASC LIMIT 1",
    [positionId],
  );
  return row ? str(row, "id") : null;
}
