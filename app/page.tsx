import { FeedList } from "@/components/FeedList";
import { FrontComments } from "@/components/FrontComments";
import { getCurrentUser } from "@/lib/auth";
import { ensureCatalog } from "@/lib/catalog";
import { getKarma, listFeed, listFrontComments } from "@/lib/db/queries";
import { isSort } from "@/lib/types";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; p?: string }>;
}) {
  const params = await searchParams;
  const sort = params.sort && isSort(params.sort) ? params.sort : null;
  const page = Math.max(1, Number.parseInt(params.p ?? "1", 10) || 1);
  await ensureCatalog();
  const now = nowMs();

  if (sort) {
    const { items, total } = await listFeed(sort, page, now);
    return <FeedList items={items} page={page} total={total} sort={sort} />;
  }

  const viewer = await getCurrentUser();
  const karma = viewer ? await getKarma(viewer.id, now) : 0;
  const { items, total } = await listFrontComments(viewer?.id ?? null, page, viewer?.showDead ?? false);
  return (
    <FrontComments items={items} page={page} total={total} viewer={viewer} now={now} karma={karma} />
  );
}
