import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CommentThread } from "@/components/CommentThread";
import { Favicon } from "@/components/Favicon";
import { MarksProvider } from "@/components/Marks";
import { PositionForm, StanceLinks } from "@/components/PositionForm";
import { HeadSkeleton, PositionSkeleton, ThreadSkeleton } from "@/components/Skeleton";
import { PulseBoard } from "@/components/StanceSplit";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  cachedStartupBySlug,
  cachedThread,
  countDeployed,
  getBookLine,
  getMarket,
  movesLeft,
} from "@/lib/db/queries";
import { cachedNow } from "@/lib/clock";
import { TAG, startupTag } from "@/lib/tags";
import { nowMs } from "@/lib/time";
import { isThreadSide, isThreadSort } from "@/lib/thread";
import { heading } from "@/lib/ui";
import { getViewerMarks } from "@/lib/viewer";
import { isDirection, type Direction, type Startup } from "@/lib/types";

type Params = Promise<{ slug: string; side?: string }>;
type Query = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Every slot awaits the URL on its own, so the page shell never waits on it.
async function resolve(params: Params): Promise<{ startup: Startup; preset: Direction | null }> {
  const { slug, side } = await params;
  if (side !== undefined && !isDirection(side)) notFound();
  const startup = await cachedStartupBySlug(slug);
  if (!startup) notFound();
  return { startup, preset: side && isDirection(side) ? side : null };
}

export function StartupView({ params, searchParams }: { params: Params; searchParams: Query }) {
  return (
    <>
      <Suspense fallback={<HeadSkeleton />}>
        <StartupHead params={params} />
      </Suspense>
      <Suspense fallback={<PositionSkeleton />}>
        <PositionSlot params={params} />
      </Suspense>
      <hr className="my-7 mb-2 border-0 border-t border-line" />
      <Suspense fallback={<ThreadSkeleton />}>
        <ThreadSlot params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StartupHead({ params }: { params: Params }) {
  const { startup } = await resolve(params);
  return (
    <>
      <header className="mb-1 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3">
        <a href={startup.url} rel="noreferrer" target="_blank" className="block leading-none hover:no-underline">
          <Favicon domain={startup.domain} name={startup.name} size={40} />
        </a>
        <div className="min-w-0">
          <h1 className={heading}>{startup.name}</h1>
          {startup.description ? (
            <p className="m-0 mb-1 text-base text-pretty">{startup.description}</p>
          ) : null}
          <p className="m-0 text-sm text-mute">
            <a href={startup.url} rel="noreferrer" target="_blank">
              {startup.domain}
            </a>
            {startup.source === "hn" && startup.sourceId ? (
              <>
                {" · "}
                <a href={`https://news.ycombinator.com/item?id=${startup.sourceId}`} rel="noreferrer" target="_blank">
                  Show HN
                </a>
              </>
            ) : null}
            <Suspense fallback={null}>
              <AdminLinks slug={startup.slug} />
            </Suspense>
          </p>
        </div>
      </header>
      <MarketBoard startupId={startup.id} slug={startup.slug} />
    </>
  );
}

async function AdminLinks({ slug }: { slug: string }) {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer)) return null;
  return (
    <>
      {" · "}
      <Link href={`/s/${slug}/edit`}>edit</Link>
      {" · "}
      <Link href={`/s/${slug}/delete`}>delete</Link>
    </>
  );
}

// Shared by every viewer; expired by any write to the world or this startup.
async function MarketBoard({ startupId, slug }: { startupId: string; slug: string }) {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.world, startupTag(startupId));
  const market = await getMarket(startupId, nowMs());
  return <PulseBoard slug={slug} market={market} />;
}

async function PositionSlot({ params }: { params: Params }) {
  const [{ startup, preset }, viewer] = await Promise.all([resolve(params), getCurrentUser()]);
  if (!viewer) return <StanceLinks slug={startup.slug} preset={preset} />;
  // The book is read fresh on every request; only after that first uncached
  // read may this component look at the real clock.
  const deployed = await countDeployed(viewer.id);
  const now = nowMs();
  const [line, moves] = await Promise.all([getBookLine(startup.id, viewer.id, now), movesLeft(viewer.id, now)]);
  return (
    <PositionForm
      // A saved change remounts the form with the new position as its baseline.
      key={`${preset ?? "open"}-${line?.position.updatedAt ?? 0}`}
      startupId={startup.id}
      line={line}
      deployed={deployed}
      movesRemaining={moves}
      username={viewer.username}
      preset={preset}
      next={preset ? `/s/${startup.slug}` : undefined}
    />
  );
}

async function ThreadSlot({ params, searchParams }: { params: Params; searchParams: Query }) {
  const [{ startup }, query] = await Promise.all([resolve(params), searchParams]);
  const [nodes, now] = await Promise.all([cachedThread(startup.id), cachedNow()]);
  const sideRaw = first(query.side);
  const sortRaw = first(query.sort);
  const side = sideRaw && isThreadSide(sideRaw) ? sideRaw : "all";
  const sort = sortRaw && isThreadSort(sortRaw) ? sortRaw : "popular";
  return (
    <MarksProvider marks={getViewerMarks()}>
      <CommentThread nodes={nodes} now={now} slug={startup.slug} side={side} sort={sort} />
    </MarksProvider>
  );
}
