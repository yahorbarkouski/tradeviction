"use client";

import Link from "next/link";
import { useState } from "react";
import { FlagVouch } from "@/components/FlagVouch";
import { ReplyForm } from "@/components/ReplyForm";
import { UserLink } from "@/components/UserLink";
import { Vote } from "@/components/Vote";
import { formatAge, stanceTone, stanceWord } from "@/lib/format";
import { THREAD_PAGE, commentPath } from "@/lib/thread";
import { cx } from "@/lib/cx";
import { quiet } from "@/lib/ui";
import type { Direction, ThreadNode, User } from "@/lib/types";

export function ThreadList({
  nodes,
  viewer,
  now,
  href,
  slug,
  karma,
}: {
  nodes: ThreadNode[];
  viewer: User | null;
  now: number;
  href: string;
  slug: string;
  karma: number;
}) {
  const [pages, setPages] = useState(1);
  const shown = nodes.slice(0, pages * THREAD_PAGE);
  const more = shown.length < nodes.length;
  return (
    <div>
      {shown.map((node) => (
        <CommentNode
          key={node.id}
          node={node}
          viewer={viewer}
          now={now}
          href={href}
          slug={slug}
          depth={0}
          karma={karma}
        />
      ))}
      {more ? (
        <p className="mt-6">
          <button type="button" className={quiet} onClick={() => setPages((n) => n + 1)}>
            more
          </button>
        </p>
      ) : null}
    </div>
  );
}

function stanceLabel(pos: { direction: Direction; conviction: number }): string {
  const word = stanceWord(pos.direction);
  return pos.conviction >= 1 ? `${word} ${pos.conviction}` : `${word} inactive`;
}

function CommentNode({
  node,
  viewer,
  now,
  href,
  slug,
  depth,
  karma,
}: {
  node: ThreadNode;
  viewer: User | null;
  now: number;
  href: string;
  slug: string;
  depth: number;
  karma: number;
}) {
  const pos = node.position;
  const dest = commentPath(slug, node.id);
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
        <Vote commentId={node.id} own={node.own} voted={node.voted} viewer={viewer} next={href} />
        <div className="min-w-0">
          <UserLink username={node.username} createdAt={node.authorCreatedAt} now={now} />
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
            own={node.own}
            dead={node.dead}
            flagged={node.flagged}
            vouched={node.vouched}
            karma={karma}
            next={dest}
            viewer={viewer}
          />
        </div>
      </div>
      <div className="mt-1 text-pretty">{node.text}</div>
      <div className="mt-1 text-sm text-mute">
        {node.points} useful
        {" · "}
        {viewer ? (
          <ReplyForm parentId={node.id} next={href} />
        ) : (
          <Link href={`/login?next=${encodeURIComponent(href)}`}>reply</Link>
        )}
      </div>
      {node.kids.map((kid) => (
        <CommentNode
          key={kid.id}
          node={kid}
          viewer={viewer}
          now={now}
          href={href}
          slug={slug}
          depth={depth + 1}
          karma={karma}
        />
      ))}
    </div>
  );
}
