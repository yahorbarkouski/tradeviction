import { Suspense } from "react";
import { FeedList } from "@/components/FeedList";
import { FrontComments } from "@/components/FrontComments";
import { ListSkeleton } from "@/components/Skeleton";
import { cachedFeed, cachedFrontPage } from "@/lib/db/queries";
import { cachedNow } from "@/lib/clock";
import { isSort } from "@/lib/types";
import { getViewerMarks } from "@/lib/viewer";
import type { Metadata } from "next";
import { HOME_BLURB, TAGLINE } from "@/lib/copy";

export const metadata: Metadata = {
  title: { absolute: "Tradeviction" },
  description: HOME_BLURB,
  openGraph: { title: { absolute: TAGLINE }, description: HOME_BLURB },
  twitter: { title: { absolute: TAGLINE }, description: HOME_BLURB },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The shell paints at once; the list depends on the URL, so it resolves
// behind the boundary (or ahead of the click, for prefetched links).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <HomeBody searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeBody({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const sortRaw = first(params.sort);
  const sort = sortRaw && isSort(sortRaw) ? sortRaw : null;
  const page = Math.max(1, Number.parseInt(first(params.p) ?? "1", 10) || 1);

  if (sort) {
    const { items, total } = await cachedFeed(sort, page);
    return <FeedList items={items} page={page} total={total} sort={sort} />;
  }

  const { items, total } = await cachedFrontPage(page);
  return <FrontComments items={items} page={page} total={total} now={await cachedNow()} marks={getViewerMarks()} />;
}
