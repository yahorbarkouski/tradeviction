import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MetricValue } from "@/components/Metric";
import { ListSkeleton } from "@/components/Skeleton";
import { cachedEvents, cachedStartupBySlug, getMarket } from "@/lib/db/queries";
import { eventKindLabel, formatAge, formatDepth, stanceWord } from "@/lib/format";
import { cx } from "@/lib/cx";
import { cachedNow } from "@/lib/clock";
import { heading, statLine } from "@/lib/ui";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/moves">): Promise<Metadata> {
  const { slug } = await params;
  const startup = await cachedStartupBySlug(slug);
  return { title: startup ? `${startup.name} moves` : "not found" };
}

export default function MovesPage({ params }: PageProps<"/s/[slug]/moves">) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <MovesBody params={params} />
    </Suspense>
  );
}

async function MovesBody({ params }: Pick<PageProps<"/s/[slug]/moves">, "params">) {
  const { slug } = await params;
  const startup = await cachedStartupBySlug(slug);
  if (!startup) notFound();
  const now = await cachedNow();
  const [market, events] = await Promise.all([getMarket(startup.id, now), cachedEvents(startup.id)]);
  return (
    <>
      <p className="text-sm text-mute">
        <Link href={`/s/${startup.slug}`}>{startup.name}</Link>
      </p>
      <h1 className={heading}>Book history</h1>
      <p className={cx(statLine, "text-sm text-mute")}>
        <MetricValue id="pulse">{market.pulse}</MetricValue>
        <span aria-hidden="true">·</span>
        <MetricValue id="depth">{formatDepth(market.depth)}</MetricValue>
      </p>
      {events.length === 0 ? (
        <p className="text-mute">No Book moves yet.</p>
      ) : (
        <ol className="mt-4 list-none p-0">
          {events.map((event) => (
            <li key={event.id} className="pt-0.5 pb-1.5">
              <span className={statLine}>
                <span
                  className={cx(
                    event.direction === "long" && "text-long",
                    event.direction === "short" && "text-short",
                  )}
                >
                  {eventKindLabel(event.kind)}
                  {event.direction ? ` ${stanceWord(event.direction)}` : ""}
                  {event.conviction !== null ? ` ${event.conviction}` : ""}
                </span>
                <span aria-hidden="true">·</span>
                <Link href={`/u/${event.username}`}>{event.username}</Link>
                <span aria-hidden="true">·</span>
                <MetricValue id="pulse">{event.pulse}</MetricValue>
                <span aria-hidden="true">·</span>
                <MetricValue id="depth">{event.depth}</MetricValue>
                <span aria-hidden="true">·</span>
                {formatAge(event.createdAt, now)}
              </span>
              {event.note ? <div className="mt-1 text-pretty">{event.note}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
