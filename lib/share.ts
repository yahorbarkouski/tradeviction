import { getBookLine, listUserBook } from "@/lib/db/book";
import { cachedThread } from "@/lib/db/comments";
import { getMarket } from "@/lib/db/markets";
import { getPlayerStats } from "@/lib/db/scores";
import { cachedStartupBySlug } from "@/lib/db/startups";
import { getUserByUsername } from "@/lib/db/users";
import type { Metadata } from "next";
import { SITE_LINE } from "@/lib/copy";
import { formatAlpha, formatRank } from "@/lib/format";
import { GENESIS_N } from "@/lib/market";
import { findThreadNode } from "@/lib/thread";
import { cachedNow } from "@/lib/clock";
import { nowMs } from "@/lib/time";
import type { BookLine, Comment, Direction, Market, Startup } from "@/lib/types";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

export function clip(text: string, n: number): string {
  const t = text.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trimEnd()}…`;
}

export function thesisAlt(comment: Comment, startup: Startup, pulse: number): string {
  const side = comment.position?.direction;
  const lead = side ? `${comment.username} ${side} ${startup.name}` : `${comment.username} on ${startup.name}`;
  return `${lead} · pulse ${pulse} · ${clip(comment.text, 80)}`;
}

// Takes the caller's clock: a bare Date.now() here would leak into the
// take page's prerender.
export async function thesisPulse(comment: Comment, fallback: number, now: number): Promise<number> {
  if (!comment.position) return fallback;
  const line = await getBookLine(comment.startupId, comment.userId, now);
  return line?.entryPulse ?? fallback;
}

export async function loadStartupMarket(slug: string) {
  const startup = await cachedStartupBySlug(slug);
  if (!startup) return null;
  const market = await getMarket(startup.id, await cachedNow());
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

// A comment is only reachable under its own startup, dead or alive.
export async function loadThesis(slug: string, id: string) {
  const startup = await cachedStartupBySlug(slug);
  if (!startup) return null;
  const thread = await cachedThread(startup.id);
  const node = findThreadNode(thread, id);
  if (!node) return null;
  const { kids: _kids, ...comment } = node;
  const now = await cachedNow();
  const market = await getMarket(startup.id, now);
  return {
    startup,
    comment,
    thread,
    market,
    pulse: await thesisPulse(comment, market.pulse, now),
  };
}

// Page metadata. The tab title takes the site suffix from the layout template;
// the Open Graph and X titles stay plain, because chat apps print the site
// name on a line of their own and X shows the title in a pill over the image.
export function pageMeta(input: {
  title: string;
  description: string;
  // Tab title before the suffix, when it should differ from the shared title.
  tab?: string;
  // What X shows in its pill, when the shared title would repeat the image.
  xTitle?: string;
  // A page that names its own image route.
  image?: { url: string; alt: string };
}): Metadata {
  return {
    title: input.tab ?? input.title,
    description: input.description,
    openGraph: {
      title: { absolute: input.title },
      description: input.description,
      ...(input.image ? { images: [{ url: input.image.url, ...OG_SIZE, alt: input.image.alt }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: { absolute: input.xTitle ?? input.title },
      description: input.description,
      ...(input.image ? { images: [input.image.url] } : {}),
    },
  };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Up to three names, then how many more.
function names(list: string[]): string {
  const shown = list.slice(0, 3);
  const last = shown[shown.length - 1] ?? "";
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${last}` : last;
  const rest = list.length - shown.length;
  return rest > 0 ? `${joined} and ${rest} more` : joined;
}

export function marketTitle(startup: Startup, market: Market): string {
  return market.forming ? `${startup.name} · forming` : `${startup.name} · pulse ${market.pulse}`;
}

export function marketBlurb(market: Market): string {
  if (market.forming) {
    return `${market.depth} in so far. The pulse opens once ${GENESIS_N} people hold a position. Get in early. ${SITE_LINE}`;
  }
  const week =
    market.delta === null || market.delta === 0
      ? "flat this week"
      : `${market.delta > 0 ? "up" : "down"} ${Math.abs(market.delta)} this week`;
  return `${market.publicLong} long, ${market.publicShort} short, ${week}, ${count(market.comments, "comment", "comments")}. Take a side. ${SITE_LINE}`;
}

export function stanceTitle(side: Direction, startup: Startup, market: Market): string {
  const verb = side === "long" ? "Long" : "Short";
  return market.forming ? `${verb} ${startup.name}?` : `${verb} ${startup.name} at ${market.pulse}?`;
}

export function stanceBlurb(side: Direction, market: Market): string {
  if (market.forming) return `${market.depth} in so far. Put a ${side} on the book and be early. ${SITE_LINE}`;
  const crowd = `${market.publicLong} are long and ${market.publicShort} short.`;
  const ask =
    side === "short"
      ? "Think they're wrong? Put a short on the book."
      : "Think there's more to come? Put a long on the book.";
  return `${crowd} ${ask} ${SITE_LINE}`;
}

export function takeTitle(comment: Comment): string {
  return clip(comment.text.replace(/\s+/g, " "), 70);
}

export function takeXTitle(comment: Comment, startup: Startup): string {
  const side = comment.position?.direction;
  return side ? `${comment.username} is ${side} ${startup.name}` : `${comment.username} on ${startup.name}`;
}

export function takeBlurb(comment: Comment, startup: Startup, pulse: number): string {
  const pos = comment.position;
  const lead = pos
    ? `${comment.username} is ${pos.direction} ${startup.name} with ${pos.conviction} conviction, at pulse ${pulse}.`
    : `${comment.username}'s comment on ${startup.name}, at pulse ${pulse}.`;
  return `${lead} ${SITE_LINE}`;
}

export function bookTitle(username: string, alpha: number, positions: number): string {
  return positions === 0 ? `${username} on Tradeviction` : `${username} · ${formatAlpha(alpha)} alpha`;
}

export function bookBlurb(input: { alpha: number; rank: number | null; lines: BookLine[] }): string {
  const longs = input.lines.filter((line) => line.position.direction === "long").map((line) => line.startup.name);
  const shorts = input.lines.filter((line) => line.position.direction === "short").map((line) => line.startup.name);
  const parts: string[] = [];
  if (input.lines.length === 0) {
    parts.push("No positions yet.");
  } else {
    parts.push(
      input.alpha > 0 && input.rank !== null && input.rank <= 50
        ? `${formatRank(input.rank).replace(/^in top /, "Top ")} by alpha.`
        : `${formatAlpha(input.alpha)} alpha.`,
    );
    if (longs.length > 0) parts.push(`Long ${names(longs)}.`);
    if (shorts.length > 0) parts.push(`Short ${names(shorts)}.`);
  }
  return `${parts.join(" ")} ${SITE_LINE}`;
}
