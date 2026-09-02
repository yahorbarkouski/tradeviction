"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { AdminCommentEdit, AdminCommentMeta } from "@/components/AdminComment";
import { FlagVouch } from "@/components/FlagVouch";
import { IntentLink } from "@/components/IntentLink";
import { useMarks } from "@/components/Marks";
import { UserLink } from "@/components/UserLink";
import { Vote } from "@/components/Vote";
import { useNow } from "@/components/useNow";
import { useVote } from "@/components/useVote";
import { cx } from "@/lib/cx";
import { formatAge, stanceTone, stanceWord } from "@/lib/format";
import { commentPath } from "@/lib/thread";
import { ownsComment, showsDead, type ViewerMarks } from "@/lib/marks";
import type { Direction, FrontComment } from "@/lib/types";

function stanceBit(pos: { direction: Direction; conviction: number }): string {
  const word = stanceWord(pos.direction);
  return pos.conviction >= 1 ? `${word} ${pos.conviction}` : word;
}

// The row's text comes from the shared, cached list and paints at once. The
// parts that depend on who is looking resolve behind their own boundary.
export function FrontCommentRow({ rank, item, now: serverNow }: { rank: number; item: FrontComment; now: number }) {
  const now = useNow(serverNow);
  return (
    <Suspense fallback={item.dead ? null : <Row rank={rank} item={item} now={now} marks={null} />}>
      <LiveRow rank={rank} item={item} now={now} />
    </Suspense>
  );
}

function LiveRow({ rank, item, now }: { rank: number; item: FrontComment; now: number }) {
  const marks = useMarks();
  if (item.dead && !showsDead(marks, item.userId)) return null;
  return <Row rank={rank} item={item} now={now} marks={marks} />;
}

function Row({ rank, item, now, marks }: { rank: number; item: FrontComment; now: number; marks: ViewerMarks | null }) {
  const href = commentPath(item.startupSlug, item.id);
  const own = ownsComment(marks, item.userId);
  const vote = useVote(marks?.voted.includes(item.id) ?? false, item.points);
  const pos = item.position;
  const points = vote.points === 1 ? "1 point" : `${vote.points} points`;
  const talk = item.replies === 0 ? "discuss" : item.replies === 1 ? "1 comment" : `${item.replies} comments`;
  const [editing, setEditing] = useState(false);
  return (
    <article
      className={cx(
        "grid grid-cols-[2.5ch_0.5rem_minmax(0,1fr)] items-start gap-x-1.5 pt-1 pb-2 text-base",
        item.dead && "opacity-50",
      )}
      id={item.id}
    >
      <span className="flex h-[1.35em] items-center justify-end font-mono text-sm tabular-nums text-mute pt-1">
        {rank}.
      </span>
      <Vote
        commentId={item.id}
        own={own}
        voted={vote.voted}
        signedIn={marks !== null}
        next="/"
        action={vote.action}
        pending={vote.pending}
        error={vote.error}
        compact
      />
      <div className="min-w-0">
        {editing ? (
          <AdminCommentEdit commentId={item.id} text={item.text} next="/" onCancel={() => setEditing(false)} />
        ) : (
          <div className="leading-[1.35] text-pretty">
            <IntentLink href={href} className="hover:underline">
              {item.text}
            </IntentLink>{" "}
            <Link href={href} className="text-sm text-mute hover:underline">
              ({item.startupName})
            </Link>
            {item.dead ? <span className="text-sm text-mute"> [dead]</span> : null}
          </div>
        )}
        <div className="text-sm leading-[1.35] text-mute">
          {points}
          {" by "}
          <UserLink
            username={item.username}
            createdAt={item.authorCreatedAt}
            now={now}
            verified={item.authorVerified}
          />
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
            own={own}
            dead={item.dead}
            flagged={marks?.flagged.includes(item.id) ?? false}
            vouched={marks?.vouched.includes(item.id) ?? false}
            karma={marks?.karma ?? 0}
            next={href}
            signedIn={marks !== null}
          />
          <AdminCommentMeta
            commentId={item.id}
            admin={marks?.admin ?? false}
            own={own}
            next="/"
            onEdit={() => setEditing(true)}
          />
        </div>
      </div>
    </article>
  );
}
