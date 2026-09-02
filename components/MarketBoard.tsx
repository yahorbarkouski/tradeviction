import { cacheLife, cacheTag } from "next/cache";
import { PulseBoard } from "@/components/StanceSplit";
import { getMarket } from "@/lib/db/queries";
import { TAG, startupTag } from "@/lib/tags";
import { nowMs } from "@/lib/time";

// Pulse, hotness, depth, the week, and the long/short bar. Shared by every
// viewer; expired by any write to the world or this company.
export async function MarketBoard({ startupId, slug }: { startupId: string; slug: string }) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.world, startupTag(startupId));
  const market = await getMarket(startupId, nowMs());
  return <PulseBoard slug={slug} market={market} />;
}
