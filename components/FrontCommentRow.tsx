"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminCommentEdit, AdminCommentMeta } from "@/components/AdminComment";
import { FlagVouch } from "@/components/FlagVouch";
import { UserLink } from "@/components/UserLink";
import { Vote } from "@/components/Vote";
import { cx } from "@/lib/cx";
import { formatAge, stanceTone, stanceWord } from "@/lib/format";
import { commentPath } from "@/lib/thread";
import type { Direction, FrontComment, User } from "@/lib/types";

function stanceBit(pos: { direction: Direction; conviction: number }): string {
  const word = stanceWord(pos.direction);
  return pos.conviction >= 1 ? `${word} ${pos.conviction}` : word;
}

export function FrontCommentRow({
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
  const [editing, setEditing] = useState(false);
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
        {editing ? (
          <AdminCommentEdit
            commentId={item.id}
            text={item.text}
            next="/"
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="leading-[1.35] text-pretty">
            <Link href={href} className="hover:underline">
              {item.text}
            </Link>{" "}
            <Link href={href} className="text-sm text-mute hover:underline">
              ({item.startupName})
            </Link>
            {item.dead ? <span className="text-sm text-mute"> [dead]</span> : null}
          </div>
        )}
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
          <AdminCommentMeta
            commentId={item.id}
            viewer={viewer}
            next="/"
            onEdit={() => setEditing(true)}
          />
        </div>
      </div>
    </article>
  );
}
