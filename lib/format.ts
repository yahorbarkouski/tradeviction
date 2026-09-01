import type { Direction, EventKind, FeedItem, Sort } from "@/lib/types";
import { HOTNESS_BREAKOUT } from "@/lib/market";

export function stanceWord(direction: Direction): "long" | "short" {
  return direction;
}

export function eventKindLabel(kind: EventKind): string {
  return kind === "thesis" ? "rewrote" : kind;
}

export function stanceTone(direction: Direction): "text-long" | "text-short" {
  return direction === "long" ? "text-long" : "text-short";
}

export function formatAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function formatWhen(at: number): string {
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDepth(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatAlpha(n: number): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const mag = Math.abs(rounded).toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
  if (rounded > 0) return `+${mag}`;
  if (rounded < 0) return `−${mag}`;
  return "0";
}

export function phaseLabel(phase: FeedItem["market"]["phase"]): string {
  if (phase === "forming") return "FORMING";
  if (phase === "quiet") return "QUIET";
  if (phase === "hot") return "HOT";
  return "ESTABLISHED";
}

export function marketMood(market: FeedItem["market"]): string | null {
  if (market.hotness >= HOTNESS_BREAKOUT && market.pulse >= 40 && market.pulse <= 60) return "Highly contested";
  return null;
}

export function formatMove(delta: number | null): string {
  if (delta === null || delta === 0) return "0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function formatBookShare(longPct: number | null): {
  label: string;
  tone: "long" | "short" | null;
} {
  if (longPct === null) return { label: "—", tone: null };
  if (longPct >= 50) return { label: `${longPct}% long`, tone: "long" };
  return { label: `${100 - longPct}% short`, tone: "short" };
}

export function formatRank(percentile: number): string {
  const n = Math.min(99, Math.max(0.1, percentile));
  const shown = n < 1 ? n.toFixed(1) : String(Math.round(n));
  return `in top ${shown}%`;
}

export function sortFeed(items: FeedItem[], sort: Sort, _now: number): FeedItem[] {
  const copy = [...items];
  if (sort === "new") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
    return copy;
  }
  if (sort === "collapses") {
    copy.sort((a, b) => (a.market.delta ?? 999) - (b.market.delta ?? 999) || b.market.depth - a.market.depth);
    return copy;
  }
  copy.sort((a, b) => b.market.hotness - a.market.hotness || (b.market.delta ?? 0) - (a.market.delta ?? 0));
  return copy;
}
