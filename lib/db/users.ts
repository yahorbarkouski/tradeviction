// Accounts: lookup, creation, standing (muted, trusted), the X link, and
// deletion. Passwords are hashed in lib/auth.ts; this module only stores them.
import { randomUUID } from "node:crypto";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intNull, intish, str, strNull } from "@/lib/db/codec";
import { eraseCommentRows } from "@/lib/db/comments";
import type { User, XChallenge } from "@/lib/types";

export type UserRecord = User & { passwordHash: string };

function parseUser(row: Record<string, unknown>): User {
  return {
    id: str(row, "id"),
    username: str(row, "username"),
    createdAt: int(row, "created_at"),
    muted: intish(row, "muted") === 1,
    showDead: intish(row, "show_dead") === 1,
    trusted: intish(row, "trusted") === 1,
    xHandle: strNull(row, "x_handle"),
    xAvatar: strNull(row, "x_avatar"),
    xVerified: intish(row, "x_verified") === 1,
  };
}

function parseUserRecord(row: Record<string, unknown>): UserRecord {
  return { ...parseUser(row), passwordHash: str(row, "password_hash") };
}

export async function getUserById(id: string): Promise<User | null> {
  const row = await getRow(
    "SELECT id, username, created_at, muted, show_dead, trusted, x_handle, x_avatar, x_verified FROM users WHERE id = ?",
    [id],
  );
  return row ? parseUser(row) : null;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const row = await getRow(
    "SELECT id, username, password_hash, created_at, muted, show_dead, trusted, x_handle, x_avatar, x_verified FROM users WHERE username = ?",
    [username],
  );
  return row ? parseUserRecord(row) : null;
}

export async function createUser(input: { username: string; passwordHash: string }): Promise<User> {
  const id = randomUUID();
  const createdAt = Date.now();
  await run(
    "INSERT INTO users (id, username, password_hash, created_at, muted, show_dead, trusted) VALUES (?, ?, ?, ?, 0, 0, 0)",
    [id, input.username, input.passwordHash, createdAt],
  );
  return {
    id,
    username: input.username,
    createdAt,
    muted: false,
    showDead: false,
    trusted: false,
    xHandle: null,
    xAvatar: null,
    xVerified: false,
  };
}

export async function setMuted(userId: string, on: boolean): Promise<void> {
  await run("UPDATE users SET muted = ? WHERE id = ?", [on ? 1 : 0, userId]);
}

export async function setTrusted(userId: string, on: boolean): Promise<void> {
  await run("UPDATE users SET trusted = ? WHERE id = ?", [on ? 1 : 0, userId]);
}

export async function setShowDead(userId: string, on: boolean): Promise<void> {
  await run("UPDATE users SET show_dead = ? WHERE id = ?", [on ? 1 : 0, userId]);
}

export class XLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XLinkError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function getXChallenge(userId: string): Promise<XChallenge | null> {
  const row = await getRow("SELECT x_code, x_code_handle, x_code_expires FROM users WHERE id = ?", [userId]);
  if (!row) return null;
  const code = strNull(row, "x_code");
  const handle = strNull(row, "x_code_handle");
  const expiresAt = intNull(row, "x_code_expires");
  if (!code || !handle || expiresAt === null) return null;
  return { handle, code, expiresAt };
}

export async function setXChallenge(userId: string, challenge: XChallenge | null): Promise<void> {
  await run("UPDATE users SET x_code = ?, x_code_handle = ?, x_code_expires = ? WHERE id = ?", [
    challenge?.code ?? null,
    challenge?.handle ?? null,
    challenge?.expiresAt ?? null,
    userId,
  ]);
}

export async function getUserIdByXId(xId: string): Promise<string | null> {
  const row = await getRow("SELECT id FROM users WHERE x_id = ?", [xId]);
  return row ? str(row, "id") : null;
}

export async function linkX(
  userId: string,
  profile: { id: string; handle: string; avatar: string | null },
  at: number,
): Promise<void> {
  try {
    await run(
      `UPDATE users
       SET x_id = ?, x_handle = ?, x_avatar = ?, x_verified = 1, x_verified_at = ?,
           x_code = NULL, x_code_handle = NULL, x_code_expires = NULL
       WHERE id = ?`,
      [profile.id, profile.handle, profile.avatar, at, userId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new XLinkError("That X account is already linked to another account.");
    }
    throw error;
  }
}

export async function unlinkX(userId: string): Promise<void> {
  await run(
    `UPDATE users
     SET x_id = NULL, x_handle = NULL, x_avatar = NULL, x_verified = 0, x_verified_at = NULL,
         x_code = NULL, x_code_handle = NULL, x_code_expires = NULL
     WHERE id = ?`,
    [userId],
  );
}

export async function listIpSiblings(userId: string): Promise<string[]> {
  const rows = await allRows(
    `SELECT DISTINCT u.username
     FROM rate_log mine
     JOIN rate_log other
       ON other.ip = mine.ip AND other.user_id IS NOT NULL AND other.user_id <> mine.user_id
     JOIN users u ON u.id = other.user_id
     WHERE mine.user_id = ? AND mine.ip <> '0.0.0.0'
     ORDER BY u.username`,
    [userId],
  );
  return rows.map((row) => str(row, "username"));
}

export async function deleteUser(id: string): Promise<void> {
  await withTransaction(async () => {
    for (let n = 0; n < 64; n += 1) {
      const stuck = await getRow(
        `SELECT 1 AS ok
         FROM comments c
         JOIN comments p ON p.id = c.parent_id
         WHERE p.user_id = ?
         LIMIT 1`,
        [id],
      );
      if (!stuck) break;
      await run(
        `UPDATE comments AS child
         SET parent_id = parent.parent_id
         FROM comments AS parent
         WHERE child.parent_id = parent.id AND parent.user_id = ?`,
        [id],
      );
    }
    await run(
      `UPDATE comments SET parent_id = NULL
       WHERE parent_id IN (SELECT id FROM comments WHERE user_id = ?)`,
      [id],
    );
    await run("DELETE FROM comment_votes WHERE user_id = ?", [id]);
    await run("DELETE FROM comment_flags WHERE user_id = ?", [id]);
    await run("DELETE FROM comment_vouches WHERE user_id = ?", [id]);
    const commentIds = (await allRows("SELECT id FROM comments WHERE user_id = ?", [id])).map((row) => str(row, "id"));
    await eraseCommentRows(commentIds);
    await run(
      `UPDATE comments SET position_id = NULL
       WHERE position_id IN (SELECT id FROM positions WHERE user_id = ?)`,
      [id],
    );
    await run("DELETE FROM lots WHERE user_id = ?", [id]);
    await run("DELETE FROM events WHERE user_id = ?", [id]);
    await run("DELETE FROM positions WHERE user_id = ?", [id]);
    await run("DELETE FROM moves WHERE user_id = ?", [id]);
    await run("DELETE FROM rate_log WHERE user_id = ?", [id]);
    // Parties they own pass to whoever joined next; one with nobody else goes too.
    await run(
      `UPDATE parties p SET owner_id = heir.user_id
       FROM (
         SELECT DISTINCT ON (party_id) party_id, user_id
         FROM party_members
         WHERE user_id <> ?
         ORDER BY party_id, joined_at ASC
       ) heir
       WHERE p.owner_id = ? AND heir.party_id = p.id`,
      [id, id],
    );
    await run("DELETE FROM party_members WHERE party_id IN (SELECT id FROM parties WHERE owner_id = ?)", [id]);
    await run("DELETE FROM parties WHERE owner_id = ?", [id]);
    await run("DELETE FROM party_members WHERE user_id = ?", [id]);
    await run("DELETE FROM users WHERE id = ?", [id]);
  });
}
