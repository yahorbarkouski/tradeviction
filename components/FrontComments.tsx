import Link from "next/link";
import { FlagVouch } from "@/components/FlagVouch";
import { UserLink } from "@/components/UserLink";
import { Vote } from "@/components/Vote";
import { cx } from "@/lib/cx";
import { formatAge, stanceTone, stanceWord } from "@/lib/format";
import { FRONT_PAGE } from "@/lib/db/queries";
import { commentPath } from "@/lib/thread";
import type { Direction, FrontComment, User } from "@/lib/types";

function stanceBit(pos: { direction: Direction; conviction: number }): string {
  const word = stanceWord(pos.direction);
  return pos.conviction >= 1 ? `${word} ${pos.conviction}` : word;
}

export function FrontComments({
  items,
  page,
  total,
  viewer,
  now,
  karma,
}: {
  items: FrontComment[];
  page: number;
  total: number;
  viewer: User | null;
  now: number;
  karma: number;
}) {
  if (items.length === 0) {
    return <p className="text-mute">No comments yet.</p>;
  }
  const more = page * FRONT_PAGE < total;
  const start = (page - 1) * FRONT_PAGE;
  return (
    <>
      <ol className="m-0 list-none p-0">
        {items.map((item, i) => (
          <li key={item.id}>
            <FrontRow rank={start + i + 1} item={item} viewer={viewer} now={now} karma={karma} />
          </li>
        ))}
      </ol>
      {more ? (
        <p className="mt-3 grid grid-cols-[2.5ch_1rem_minmax(0,1fr)] gap-x-1.5 text-sm">
          <span />
          <span />
          <Link href={`/?p=${page + 1}`}>More</Link>
        </p>
      ) : null}
    </>
  );
}

function FrontRow({
  rank,
  item,
  viewer,
  now,
  karma,
}: {
  rank: number;
  item: FrontComment;
  viewer: User | null;
  now: number;
  karma: number;
}) {
  const href = commentPath(item.startupSlug, item.id);
  const pos = item.position;
  const points = item.points === 1 ? "1 point" : `${item.points} points`;
  const talk =
    item.replies === 0 ? "discuss" : item.replies === 1 ? "1 comment" : `${item.replies} comments`;
  return (
    <article
      className={cx(
        "grid grid-cols-[2.5ch_1rem_minmax(0,1fr)] items-start gap-x-1.5 pt-1 pb-2 text-base",
        item.dead && "opacity-50",
      )}
      id={item.id}
    >
      <span className="flex h-[1.35em] items-center justify-end font-mono text-sm tabular-nums text-mute">
        {rank}.
      </span>
      <Vote
        commentId={item.id}
        own={item.own}
        voted={item.voted}
        viewer={viewer}
        next="/"
        compact
      />
      <div className="min-w-0">
        <div className="leading-[1.35] text-pretty">
          <Link href={href} className="hover:underline">
            {item.text}
          </Link>{" "}
          <Link href={href} className="text-sm text-mute hover:underline">
            ({item.startupName})
          </Link>
          {item.dead ? <span className="text-sm text-mute"> [dead]</span> : null}
        </div>
        <div className="text-sm leading-[1.35] text-mute">
          {points}
          {" by "}
          <UserLink username={item.username} createdAt={item.authorCreatedAt} now={now} />
          {pos ? (
            <>
              {" "}
              <span className={stanceTone(pos.direction)}>{stanceBit(pos)}</span>
            </>
          ) : null}
          {" · "}
          {formatAge(item.createdAt, now)}
          {" | "}
          <Link href={href}>{talk}</Link>
          <FlagVouch
            commentId={item.id}
            own={item.own}
            dead={item.dead}
            flagged={item.flagged}
            vouched={item.vouched}
            karma={karma}
            next={href}
            viewer={viewer}
          />
        </div>
      </div>
    </article>
  );
}
