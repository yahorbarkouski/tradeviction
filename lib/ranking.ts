import type { FeedItem, Sort } from "@/lib/types";

// The order of the company feed. "hot" puts the boards with the most fresh
// activity first, "collapses" the ones whose Pulse fell hardest this week.
export function sortFeed(items: FeedItem[], sort: Sort): FeedItem[] {
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
