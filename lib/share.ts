import {
  getBookLine,
  getCommentById,
  getMarket,
  getPlayerStats,
  getStartupBySlug,
  getUserByUsername,
  listUserBook,
} from "@/lib/db/queries";
import { formatAlpha } from "@/lib/format";
import { nowMs } from "@/lib/time";
import type { Comment, Direction, Startup } from "@/lib/types";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

export function clip(text: string, n: number): string {
  const t = text.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

export function marketAlt(startup: Startup, pulse: number, forming: boolean): string {
  if (forming) return `${startup.name} · forming · pulse ${pulse}`;
  return `${startup.name} · pulse ${pulse}`;
}

export function stanceAlt(side: Direction, startup: Startup, pulse: number): string {
  return `Go ${side} ${startup.name} · pulse ${pulse}`;
}

export function thesisAlt(comment: Comment, startup: Startup, pulse: number): string {
  const side = comment.position?.direction;
  const lead = side ? `${comment.username} ${side} ${startup.name}` : `${comment.username} on ${startup.name}`;
  return `${lead} · pulse ${pulse} · ${clip(comment.text, 80)}`;
}

export function bookAlt(username: string, alpha: number, long: number, short: number): string {
  if (long + short === 0) return `${username} · no positions yet`;
  return `${username} · ${formatAlpha(alpha)} · ${long} long, ${short} short`;
}

export async function thesisPulse(comment: Comment, fallback: number): Promise<number> {
  if (!comment.position) return fallback;
  const line = await getBookLine(comment.startupId, comment.userId);
  return line?.entryPulse ?? fallback;
}

export async function loadStartupMarket(slug: string) {
  const startup = await getStartupBySlug(slug);
  if (!startup) return null;
  const market = await getMarket(startup.id, nowMs());
  return { startup, market };
}

export async function loadProfileBook(username: string) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  const now = nowMs();
  const lines = (await listUserBook(user.id, now)).filter((line) => line.position.conviction >= 1);
  return {
    user,
    lines,
    stats: await getPlayerStats(user.id, now),
    long: lines.filter((line) => line.position.direction === "long").length,
    short: lines.filter((line) => line.position.direction === "short").length,
  };
}

export async function loadThesis(slug: string, id: string) {
  const startup = await getStartupBySlug(slug);
  if (!startup) return null;
  const comment = await getCommentById(id);
  if (!comment || comment.startupId !== startup.id) return null;
  const market = await getMarket(startup.id, nowMs());
  return {
    startup,
    comment,
    market,
    pulse: await thesisPulse(comment, market.pulse),
  };
}
