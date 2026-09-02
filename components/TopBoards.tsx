import Link from "next/link";
import { MetricHead } from "@/components/Metric";
import { formatAlpha } from "@/lib/format";
import { cx } from "@/lib/cx";
import { kicker, num, page } from "@/lib/ui";
import type { Leader, Leaderboard } from "@/lib/types";

const cols = "grid grid-cols-[2.5ch_minmax(0,1fr)_6ch_4ch] gap-x-1.5";

export function TopBoards({ board, viewerId }: { board: Leaderboard; viewerId: string | null }) {
  return (
    <div className={cx(page, "flex flex-col gap-8 md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-0")}>
      <Board title="Alpha" empty="Nobody has posted a position yet." rows={board.alpha} viewerId={viewerId} />
      <Board title="Karma" empty="No arguments have been voted for yet." rows={board.karma} viewerId={viewerId} />
    </div>
  );
}

function Board({
  title,
  empty,
  rows,
  viewerId,
}: {
  title: string;
  empty: string;
  rows: Leader[];
  viewerId: string | null;
}) {
  return (
    <section>
      <header className={cx(cols, "items-center pb-1.5 leading-none")}>
        <span />
        <h2 className={cx(kicker, "m-0")}>{title}</h2>
        <MetricHead id="alpha" className="justify-end" />
        <MetricHead id="karma" className="justify-end" />
      </header>
      {rows.length === 0 ? (
        <p className="text-mute">{empty}</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((row) => (
            <LeaderRow key={row.userId} row={row} own={row.userId === viewerId} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LeaderRow({ row, own }: { row: Leader; own: boolean }) {
  return (
    <li className="pt-1 pb-1.5">
      <div className={cx(cols, "items-baseline")}>
        <span className="flex justify-end font-mono text-sm tabular-nums text-mute">{row.rank}.</span>
        <div className="min-w-0 truncate">
          <Link href={`/u/${row.username}`}>{row.username}</Link>
          {own ? <span className="text-mute"> you</span> : null}
        </div>
        <span className={cx(num, "flex justify-end whitespace-nowrap", row.alpha >= 0 ? "text-long" : "text-short")}>
          {formatAlpha(row.alpha)}
        </span>
        <span className={cx(num, "flex justify-end whitespace-nowrap")}>{row.karma.toLocaleString("en-US")}</span>
      </div>
    </li>
  );
}
