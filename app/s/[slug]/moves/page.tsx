import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricValue } from "@/components/Metric";
import { getMarket, getStartupBySlug, listEventsForStartup } from "@/lib/db/queries";
import { eventKindLabel, formatAge, formatDepth, stanceWord } from "@/lib/format";
import { nowMs } from "@/lib/time";
import { cx } from "@/lib/cx";
import { heading, statLine } from "@/lib/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const startup = await getStartupBySlug(slug);
  return { title: startup ? `${startup.name} moves` : "not found" };
}

export default async function MovesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const startup = await getStartupBySlug(slug);
  if (!startup) notFound();
  const now = nowMs();
  const market = await getMarket(startup.id, now);
  const events = await listEventsForStartup(startup.id);
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