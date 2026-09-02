// One company's market and the ranked feed of every company, read from the
// cached world.
import { cacheLife, cacheTag } from "next/cache";
import { listStartups } from "@/lib/db/startups";
import { cachedWorld, marketOf } from "@/lib/engine";
import { sortFeed } from "@/lib/ranking";
import { TAG } from "@/lib/tags";
import type { FeedItem, Market, Sort, Startup } from "@/lib/types";

export const PAGE_SIZE = 30;

async function toFeed(startups: Startup[], now: number): Promise<FeedItem[]> {
  const world = await cachedWorld(now);
  return startups.map((startup) => ({
    ...startup,
    market: marketOf(world, startup.id),
  }));
}

export async function getMarket(startupId: string, now = Date.now()): Promise<Market> {
  return marketOf(await cachedWorld(now), startupId);
}

export async function listFeed(
  sort: Sort,
  page: number,
  now = Date.now(),
): Promise<{ items: FeedItem[]; total: number }> {
  const ranked = sortFeed(await toFeed(await listStartups(), now), sort);
  const start = (page - 1) * PAGE_SIZE;
  return { items: ranked.slice(start, start + PAGE_SIZE), total: ranked.length };
}

export async function cachedFeed(sort: Sort, page: number): Promise<{ items: FeedItem[]; total: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.world, TAG.startups);
  return listFeed(sort, page, Date.now());
}
