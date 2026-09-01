import type { FeedItem, Sort } from "@/lib/types";

export { sortFeed } from "@/lib/format";

export function disagreement(item: FeedItem): number {
  if (item.market.convLongPct === null) return 0;
  return Math.abs(item.market.pulse - item.market.convLongPct);
}

export function isHot(item: FeedItem): boolean {
  return item.market.hotness > 0;
}

export function isCollapse(item: FeedItem): boolean {
  if (item.market.forming) return false;
  return (item.market.delta ?? 0) <= -8 && item.market.depth > 0;
}

export function isDisagreement(item: FeedItem): boolean {
  return item.market.depth >= 3 && disagreement(item) >= 18;
}

export function sortLabel(sort: Sort): string {
  if (sort === "new") return "new";
  if (sort === "collapses") return "collapses";
  return "hot";
}
