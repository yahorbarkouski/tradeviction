import { randomUUID } from "node:crypto";
import { expect, vi } from "vitest";
import {
  bookAction,
  flagAction,
  loginAction,
  registerAction,
  replyAction,
  submitStartupAction,
  voteAction,
  vouchAction,
  type ActionState,
} from "@/app/actions";
import { getCurrentUser, hashPassword, setSession } from "@/lib/auth";
import { getRow, run } from "@/lib/db";
import { insertStartup, listFrontComments } from "@/lib/db/queries";
import { ELIGIBLE_STARTUPS } from "@/lib/market";
import { slugify } from "@/lib/slug";
import { DAY_MS } from "@/lib/time";
import type { Direction, Startup, User } from "@/lib/types";
import { RedirectError, request } from "./request";

export const PASSWORD = "password123";

let cachedHash: string | null = null;
export function passwordHash(): string {
  cachedHash ??= hashPassword(PASSWORD);
  return cachedHash;
}

// Fakes only Date, so pg's real timers keep working. Time stands still until
// advanced, which makes every rate-limit gap deterministic.
export const clock = {
  set(at: number): void {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
  },
  advance(ms: number): void {
    clock.set(Date.now() + ms);
  },
  freeze(): number {
    clock.set(Date.now());
    return Date.now();
  },
};

let ipSeq = 0;
export function freshIp(): string {
  ipSeq += 1;
  return `198.51.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

export function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

export type Outcome = { redirect: string | null; state: ActionState };

export async function outcome(p: Promise<ActionState | void>): Promise<Outcome> {
  try {
    const state = await p;
    return { redirect: null, state: state ?? null };
  } catch (error) {
    if (error instanceof RedirectError) return { redirect: error.url, state: null };
    throw error;
  }
}

export async function expectRedirect(p: Promise<unknown>, url?: string | RegExp): Promise<string> {
  try {
    await p;
  } catch (error) {
    if (error instanceof RedirectError) {
      if (typeof url === "string") expect(error.url).toBe(url);
      else if (url) expect(error.url).toMatch(url);
      return error.url;
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

export async function actAs(user: User | null): Promise<void> {
  request.cookies.clear();
  if (user) await setSession(user.id);
}

export async function makeUser(
  opts: { username?: string; createdAt?: number; trusted?: boolean; muted?: boolean; verified?: boolean } = {},
): Promise<User> {
  const id = randomUUID();
  const username = opts.username ?? `u${id.replace(/-/g, "").slice(0, 12)}`;
  const createdAt = opts.createdAt ?? Date.now();
  const xId = opts.verified ? id.replace(/-/g, "").slice(0, 18) : null;
  await run(
    `INSERT INTO users (id, username, password_hash, created_at, muted, show_dead, trusted, x_id, x_handle, x_verified, x_verified_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      id,
      username,
      passwordHash(),
      createdAt,
      opts.muted ? 1 : 0,
      opts.trusted ? 1 : 0,
      xId,
      xId ? username : null,
      xId ? 1 : 0,
      xId ? createdAt : null,
    ],
  );
  return {
    id,
    username,
    createdAt,
    muted: Boolean(opts.muted),
    showDead: false,
    trusted: Boolean(opts.trusted),
    xHandle: xId ? username : null,
    xAvatar: null,
    xVerified: Boolean(xId),
  };
}

let startupSeq = 0;
export async function makeStartup(name?: string): Promise<Startup> {
  startupSeq += 1;
  const label = name ?? `Startup ${startupSeq} ${randomUUID().slice(0, 6)}`;
  return insertStartup({
    name: label,
    description: "A company used by the integration tests",
    url: `https://${slugify(label)}.com`,
    source: "manual",
    sourceId: null,
    createdAt: Date.now(),
  });
}

// Backdates the account past the eligibility age, gives it first touches on
// enough startups, and has a trusted member upvote one of its comments, so
// accounted() is true from now on. Pass endorse: false to leave out the upvote.
export async function establish(
  user: User,
  opts: { touches?: number; ageMs?: number; endorse?: boolean } = {},
): Promise<void> {
  const createdAt = Date.now() - (opts.ageMs ?? 8 * DAY_MS);
  await run("UPDATE users SET created_at = ? WHERE id = ?", [createdAt, user.id]);
  user.createdAt = createdAt;
  const touches = opts.touches ?? ELIGIBLE_STARTUPS;
  const startups: Startup[] = [];
  for (let i = 0; i < touches; i += 1) {
    const startup = await makeStartup();
    startups.push(startup);
    await run(
      `INSERT INTO positions (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
       VALUES (?, ?, ?, 'long', 0, '', ?, ?, NULL)`,
      [randomUUID(), user.id, startup.id, createdAt, createdAt],
    );
  }
  if (opts.endorse === false) return;
  const startup = startups[0] ?? (await makeStartup());
  const comment = await plainComment(user, startup, "an endorsed take", createdAt);
  await endorse(comment, createdAt);
}

// A trusted member upvotes the comment at the given time.
export async function endorse(commentId: string, at = Date.now()): Promise<User> {
  const endorser = await makeUser({ trusted: true, createdAt: at });
  await run("INSERT INTO comment_votes (comment_id, user_id, created_at) VALUES (?, ?, ?)", [commentId, endorser.id, at]);
  return endorser;
}

export async function register(username: string, opts: { password?: string; ip?: string; next?: string } = {}): Promise<User> {
  request.cookies.clear();
  request.ip = opts.ip ?? freshIp();
  const fields: Record<string, string> = { username, password: opts.password ?? PASSWORD };
  if (opts.next) fields.next = opts.next;
  await expectRedirect(registerAction(null, form(fields)));
  const user = await getCurrentUser();
  if (!user) throw new Error("register did not sign the user in");
  return user;
}

export async function registerResult(fields: Record<string, string>, ip = freshIp()): Promise<Outcome> {
  request.cookies.clear();
  request.ip = ip;
  return outcome(registerAction(null, form(fields)));
}

export async function login(username: string, password = PASSWORD, extra: Record<string, string> = {}): Promise<Outcome> {
  request.cookies.clear();
  return outcome(loginAction(null, form({ username, password, ...extra })));
}

export const THESIS = "A thesis long enough to read like an argument about the company.";

export async function openPosition(
  user: User,
  startup: Startup,
  input: { direction?: Direction; conviction?: number; note?: string; close?: boolean; next?: string } = {},
): Promise<Outcome> {
  await actAs(user);
  const fields: Record<string, string> = { startupId: startup.id };
  if (input.close) {
    fields.close = "1";
  } else {
    fields.direction = input.direction ?? "long";
    fields.conviction = String(input.conviction ?? 10);
    fields.note = input.note ?? THESIS;
  }
  if (input.next) fields.next = input.next;
  return outcome(bookAction(null, form(fields)));
}

export async function thesisOf(user: User, startup: Startup): Promise<string> {
  const row = await getRow(
    `SELECT id FROM comments WHERE user_id = ? AND startup_id = ? AND parent_id IS NULL ORDER BY created_at DESC LIMIT 1`,
    [user.id, startup.id],
  );
  if (!row) throw new Error("no thesis comment for that position");
  return String(row.id);
}

// Opens a position and returns the thesis comment id it created.
export async function thesis(user: User, startup: Startup, note = THESIS, conviction = 10): Promise<string> {
  const result = await openPosition(user, startup, { note, conviction });
  if (result.state?.error) throw new Error(`could not open position: ${result.state.error}`);
  return thesisOf(user, startup);
}

// A root comment without a position, inserted directly. Handy when a test needs
// many comments and the book path's gaps and move caps would get in the way.
export async function plainComment(user: User, startup: Startup, text = "A plain root comment", at = Date.now()): Promise<string> {
  const id = randomUUID();
  await run(
    `INSERT INTO comments (id, startup_id, user_id, parent_id, position_id, text, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
    [id, startup.id, user.id, text, at],
  );
  return id;
}

export async function vote(user: User, commentId: string, op: "up" | "down" = "up", next?: string): Promise<Outcome> {
  await actAs(user);
  const fields: Record<string, string> = { commentId, op };
  if (next) fields.next = next;
  return outcome(voteAction(null, form(fields)));
}

export async function reply(user: User, parentId: string, text: string, next?: string): Promise<Outcome> {
  await actAs(user);
  const fields: Record<string, string> = { parentId, text };
  if (next) fields.next = next;
  return outcome(replyAction(null, form(fields)));
}

export async function flag(user: User, commentId: string): Promise<Outcome> {
  await actAs(user);
  return outcome(flagAction(form({ commentId })));
}

export async function vouch(user: User, commentId: string): Promise<Outcome> {
  await actAs(user);
  return outcome(vouchAction(form({ commentId })));
}

export async function submit(user: User | null, fields: Record<string, string>): Promise<Outcome> {
  await actAs(user);
  return outcome(submitStartupAction(null, form(fields)));
}

export async function frontPage(viewer: User | null = null, now = Date.now()) {
  const { items, total } = await listFrontComments(viewer?.id ?? null, 1, viewer?.showDead ?? false, now);
  return { total, items, texts: items.map((item) => item.text) };
}
