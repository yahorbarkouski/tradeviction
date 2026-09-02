import Link from "next/link";
import { MetricLabel } from "@/components/Metric";
import { asciiSplit } from "@/lib/ascii";
import { formatDepth, formatMove } from "@/lib/format";
import { cx } from "@/lib/cx";
import { label, metric, num } from "@/lib/ui";
import type { Market } from "@/lib/types";

// Width of the ASCII long/short bar, in characters.
const BAR_WIDTH = 18;

export function CallSpark({ series, size = "row" }: { series: (number | null)[]; size?: "row" | "metric" }) {
  return (
    <div
      className={cx(
        "font-mono font-medium tracking-normal",
        size === "metric" ? "text-lg leading-none" : "w-[7ch] text-sm leading-none",
      )}
      title="Public Pulse, last 7 days. Oldest on the left."
    >
      {series.map((value, i) => (
        <span key={i} className={value === null ? "text-mute" : value >= 0.5 ? "text-long" : "text-short"}>
          {value === null ? "." : "#"}
        </span>
      ))}
    </div>
  );
}

export function PulseBoard({ slug, market }: { slug: string; market: Market }) {
  const people = market.publicLong + market.publicShort;
  const move = market.delta;
  const moveTone = move === null || move === 0 ? "text-mute" : move > 0 ? "text-long" : "text-short";
  return (
    <section className="my-5 mt-3 border-b border-line py-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <div className={cx(label, "mb-2")}>
            <MetricLabel id="pulse">pulse</MetricLabel>
          </div>
          <div className={metric}>{market.pulse}</div>
          {move !== null ? (
            <Link
              href={`/s/${slug}/moves`}
              className={cx("mt-1 inline-block font-mono text-sm tabular-nums", moveTone)}
            >
              {formatMove(move)} 7d
            </Link>
          ) : null}
        </div>
        <div>
          <div className={cx(label, "mb-2")}>
            <MetricLabel id="hotness">hotness</MetricLabel>
          </div>
          <div className={metric}>{market.hotness}</div>
          <div className="mt-1 font-mono text-sm text-mute tabular-nums">
            {market.heatActors} {market.heatActors === 1 ? "actor" : "actors"} / 72h
          </div>
        </div>
        <div>
          <div className={cx(label, "mb-2")}>
            <MetricLabel id="depth">depth</MetricLabel>
          </div>
          <div className={metric}>{formatDepth(market.depth)}</div>
          <div className="mt-1 font-mono text-sm text-mute tabular-nums">{people} public</div>
        </div>
        <div>
          <div className={cx(label, "mb-2")}>7d</div>
          <CallSpark series={market.series} size="metric" />
        </div>
      </div>
      <PulseBar long={market.publicLong} short={market.publicShort} />
    </section>
  );
}

function PulseBar({ long, short }: { long: number; short: number }) {
  const total = long + short;
  const parts = asciiSplit(long, short, BAR_WIDTH);
  return (
    <div className={cx(num, "mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1")}>
      <span className="tracking-normal" aria-hidden="true">
        [
        {total === 0 ? (
          <span className="text-mute">{parts.short}</span>
        ) : (
          <>
            <span className="text-long">{parts.long}</span>
            <span className="text-short">{parts.short}</span>
          </>
        )}
        ]
      </span>
      <span>
        <span className="text-long">{long} long</span>
        <span className="text-mute"> · </span>
        <span className="text-short">{short} short</span>
      </span>
    </div>
  );
}
