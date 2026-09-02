"use client";

import Link from "next/link";
import { createContext, Suspense, useContext, useOptimistic, useState } from "react";
import { AdminCommentEdit, AdminCommentMeta } from "@/components/AdminComment";
import { FlagVouch } from "@/components/FlagVouch";
import { useMarks } from "@/components/Marks";
import { ReplyForm } from "@/components/ReplyForm";
import { ShareLink } from "@/components/ShareLink";
import { UserLink } from "@/components/UserLink";
import { Vote } from "@/components/Vote";
import { useNow } from "@/components/useNow";
import { useVote } from "@/components/useVote";
import { formatAge, stanceTone, stanceWord } from "@/lib/format";
import { THREAD_PAGE, commentPath } from "@/lib/thread";
import { cx } from "@/lib/cx";
import { quiet } from "@/lib/ui";
import { ownsComment, showsDead, type ViewerMarks } from "@/lib/marks";
import type { Direction, ThreadNode } from "@/lib/types";

// A reply the viewer just sent, shown under its parent until the server's
// re-render carries the real one.
export type PendingReply = {
  id: string;
  parentId: string;
  text: string;
  username: string;
  createdAt: number;
};

const PendingContext = createContext<((reply: PendingReply) => void) | null>(null);

export function useAddPendingReply(): (reply: PendingReply) => void {
  return useContext(PendingContext) ?? (() => {});
}

export function ThreadList({
  nodes,
  now: serverNow,
  href,
  slug,
}: {
  nodes: ThreadNode[];
  now: number;
  href: string;
  slug: string;
}) {
  const now = useNow(serverNow);
  const [pages, setPages] = useState(1);
  const [pending, addPending] = useOptimistic<PendingReply[], PendingReply>([], (state, reply) => [
    ...state,
    reply,
  ]);
  const shown = nodes.slice(0, pages * THREAD_PAGE);
  const more = shown.length < nodes.length;
  return (
    <PendingContext value={addPending}>
      <div>
        {shown.map((node) => (
          <CommentNode key={node.id} node={node} now={now} href={href} slug={slug} depth={0} pending={pending} />
        ))}
        {more ? (
          <p className="mt-6">
            <button type="button" className={quiet} onClick={() => setPages((n) => n + 1)}>
              more
            </button>
          </p>
        ) : null}
      </div>
    </PendingContext>
  );
}

function stanceLabel(pos: { direction: Direction; conviction: number }): string {
  const word = stanceWord(pos.direction);
  return pos.conviction >= 1 ? `${word} ${pos.conviction}` : `${word} inactive`;
}

function CommentNode({
  node,
  now,
  href,
  slug,
  depth,
  pending,
}: {
  node: ThreadNode;
  now: number;
  href: string;
  slug: string;
  depth: number;
  pending: PendingReply[];
}) {
  return (
    <Suspense fallback={node.dead ? null : <Body node={node} now={now} href={href} slug={slug} depth={depth} pending={pending} marks={null} />}>
      <LiveNode node={node} now={now} href={href} slug={slug} depth={depth} pending={pending} />
    </Suspense>
  );
}

function LiveNode(props: {
  node: ThreadNode;
  now: number;
  href: string;
  slug: string;
  depth: number;
  pending: PendingReply[];
}) {
  const marks = useMarks();
  if (props.node.dead && !showsDead(marks, props.node.userId)) return null;
  return <Body {...props} marks={marks} />;
}

function Body({
  node,
  now,
  href,
  slug,
  depth,
  pending,
  marks,
}: {
  node: ThreadNode;
  now: number;
  href: string;
  slug: string;
  depth: number;
  pending: PendingReply[];
  marks: ViewerMarks | null;
}) {
  const pos = node.position;
  const dest = commentPath(slug, node.id);
  const own = ownsComment(marks, node.userId);
  const vote = useVote(marks?.voted.includes(node.id) ?? false, node.points);
  const [editing, setEditing] = useState(false);
  const mine = pending.filter((reply) => reply.parentId === node.id);
  return (
    <div
      className={cx(
        depth === 0 ? "mt-5" : "mt-3",
        depth > 0 && "md:ml-8 max-md:border-l max-md:border-line max-md:pl-3.5",
        node.dead && "opacity-50",
      )}
      id={node.id}
    >
      <div className="flex items-center gap-x-1.5 text-sm text-mute">
        <Vote
          commentId={node.id}
          own={own}
          voted={vote.voted}
          signedIn={marks !== null}
          next={href}
          action={vote.action}
          pending={vote.pending}
          error={vote.error}
        />
        <div className="min-w-0">
          <UserLink username={node.username} createdAt={node.authorCreatedAt} now={now} verified={node.authorVerified} />
          {" · "}
          <Link href={dest}>{formatAge(node.createdAt, now)}</Link>
          {pos ? (
            <>
              {" · "}
              <span className={stanceTone(pos.direction)}>{stanceLabel(pos)}</span>
            </>
          ) : null}
          {node.dead ? <span> · [dead]</span> : null}
          <FlagVouch
            commentId={node.id}
            own={own}
            dead={node.dead}
            flagged={marks?.flagged.includes(node.id) ?? false}
            vouched={marks?.vouched.includes(node.id) ?? false}
            karma={marks?.karma ?? 0}
            next={dest}
            signedIn={marks !== null}
          />
          <AdminCommentMeta commentId={node.id} admin={marks?.admin ?? false} next={href} onEdit={() => setEditing(true)} />
        </div>
      </div>
      {editing ? (
        <AdminCommentEdit commentId={node.id} text={node.text} next={href} onCancel={() => setEditing(false)} />
      ) : (
        <div className="mt-1 text-pretty">{node.text}</div>
      )}
      <div className="mt-1 text-sm text-mute">
        {vote.points} useful
        {" · "}
        {marks ? (
          <ReplyForm parentId={node.id} username={marks.username} />
        ) : (
          <Link href={`/login?next=${encodeURIComponent(href)}`}>reply</Link>
        )}
        {" · "}
        <ShareLink path={dest} />
      </div>
      {node.kids.map((kid) => (
        <CommentNode key={kid.id} node={kid} now={now} href={href} slug={slug} depth={depth + 1} pending={pending} />
      ))}
      {mine.map((reply) => (
        <PendingNode key={reply.id} reply={reply} now={now} />
      ))}
    </div>
  );
}

function PendingNode({ reply, now }: { reply: PendingReply; now: number }) {
  return (
    <div className="mt-3 opacity-60 md:ml-8 max-md:border-l max-md:border-line max-md:pl-3.5" aria-busy="true">
      <div className="text-sm text-mute">
        {reply.username}
        {" · "}
        {formatAge(reply.createdAt, now)}
        {" · sending"}
      </div>
      <div className="mt-1 text-pretty">{reply.text}</div>
    </div>
  );
}
