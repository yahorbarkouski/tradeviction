import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { IntentLink } from "@/components/IntentLink";
import { Favicon } from "@/components/Favicon";
import { MetricHead, MetricValue } from "@/components/Metric";
import { CallSpark } from "@/components/StanceSplit";
import { formatDepth, formatMove, phaseLabel } from "@/lib/format";
import type { FeedItem } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/db/queries";
import { cx } from "@/lib/cx";
import { label, num, statLine } from "@/lib/ui";

const desk =
  "grid grid-cols-[2.5ch_1.25rem_minmax(0,1fr)_2.25rem_2.25rem_2.5rem_7ch] items-start gap-x-1.5";

const line = "flex h-[1.35em] items-center";

const stat = "inline-flex w-full items-center justify-center leading-[1.35] hover:no-underline";

export function FeedList({
  items,
  page,
  total,
  sort,
}: {
  items: FeedItem[];
  page: number;
  total: number;
  sort: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-mute">
        No startups yet. <Link href="/submit">Submit one</Link>.
      </p>
    );
  }
  const more = page * PAGE_SIZE < total;
  const start = (page - 1) * PAGE_SIZE;
  return (
    <>
      <ol className="m-0 list-none p-0">
        <li className="max-md:hidden" aria-hidden="true">
          <div className={cx(desk, "items-center pb-1", label)}>
            <span />
            <span />
            <span />
            <MetricHead id="pulse" className="justify-center" />
            <MetricHead id="hotness" className="justify-center" />
            <MetricHead id="delta" className="justify-center" />
            <span className="inline-flex w-full justify-center" title="7 days">
              <CalendarRange
                size={16}
                strokeWidth={2}
                aria-hidden
                className="inline-block h-[1em] w-[1em] shrink-0"
              />
            </span>
          </div>
        </li>
        {items.map((item, i) => (
          <FeedRow key={item.id} rank={start + i + 1} item={item} />
        ))}
      </ol>
      {more ? (
        <p className="mt-3 text-sm md:grid md:grid-cols-[2.5ch_1.25rem_minmax(0,1fr)_2.25rem_2.25rem_2.5rem_7ch] md:gap-x-1.5">
          <span className="max-md:hidden" />
          <span className="max-md:hidden" />
          <Link href={`/?sort=${sort}&p=${page + 1}`}>More</Link>
        </p>
      ) : null}
    </>
  );
}

function FeedRow({ rank, item }: { rank: number; item: FeedItem }) {
  const { market } = item;
  const delta = market.delta;
  const moveTone =
    delta === null || delta === 0 ? "text-ink" : delta > 0 ? "text-long" : "text-short";
  const href = `/s/${item.slug}`;
  return (
    <li className="pt-0.5 pb-1.5">
      <div className={cx(desk, "max-md:hidden")}>
        <Rank rank={rank} />
        <IconLink item={item} />
        <div className="min-w-0">
          <Title item={item} />
          <Meta item={item} />
        </div>
        <Link href={href} className={cx(num, stat, line)}>
          {market.pulse}
        </Link>
        <Link href={href} className={cx(num, stat, line)}>
          {market.hotness}
        </Link>
        <Link href={`${href}/moves`} className={cx(num, stat, line, moveTone)}>
          {formatMove(delta)}
        </Link>
        <div className={cx(line, "w-full justify-center")}>
          <CallSpark series={market.series} />
        </div>
      </div>
      <div className="flex gap-x-1.5 md:hidden">
        <Rank rank={rank} />
        <IconLink item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-x-3">
            <div className="min-w-0 flex-1">
              <Title item={item} />
              <div className="text-sm leading-[1.35] text-mute">
                <Link href={href} className={statLine}>
                  <MetricValue id="depth">{formatDepth(market.depth)}</MetricValue>
                  <span aria-hidden="true">·</span>
                  {market.comments} {market.comments === 1 ? "comment" : "comments"}
                  <span aria-hidden="true">·</span>
                  <MetricValue id="hotness">{market.hotness}</MetricValue>
                  <span aria-hidden="true">·</span>
                  <span className={moveTone}>{formatMove(delta)}</span>
                </Link>
              </div>
            </div>
            <Link href={href} className={cx(num, "flex shrink-0 flex-col items-end hover:no-underline")}>
              <span className="leading-[1.35]">{market.pulse}</span>
              <CallSpark series={market.series} />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

function Rank({ rank }: { rank: number }) {
  return (
    <span className={cx(line, "w-[2.5ch] shrink-0 justify-end font-mono text-sm tabular-nums text-mute pt-0.5")}>
      {rank}.
    </span>
  );
}

function IconLink({ item }: { item: FeedItem }) {
  return (
    <Link href={`/s/${item.slug}`} className={cx(line, "shrink-0 hover:no-underline pt-1")} tabIndex={-1}>
      <Favicon domain={item.domain} name={item.name} size={20} />
    </Link>
  );
}

function Title({ item }: { item: FeedItem }) {
  const { market } = item;
  return (
    <div className="leading-[1.35] text-pretty">
      <IntentLink href={`/s/${item.slug}`}>{item.name}</IntentLink>{" "}
      <a href={item.url} rel="noreferrer" target="_blank" className="text-sm text-mute">
        ({item.domain})
      </a>
      {market.phase !== "active" ? (
        <span className="ml-1.5 font-mono text-sm text-mute">
          {phaseLabel(market.phase)}
          {market.phase === "quiet" ? ` · ${market.quietDays}d` : ""}
        </span>
      ) : null}
    </div>
  );
}

function Meta({ item }: { item: FeedItem }) {
  const { market } = item;
  return (
    <div className="text-sm leading-[1.35] text-mute">
      <Link href={`/s/${item.slug}`} className={statLine}>
        <MetricValue id="depth">{formatDepth(market.depth)}</MetricValue>
        <span aria-hidden="true">·</span>
        {market.comments} {market.comments === 1 ? "comment" : "comments"}
      </Link>
    </div>
  );
}
