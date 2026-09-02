"use client";

import { useState, type MouseEvent } from "react";
import { ThreadList } from "@/components/ThreadList";
import {
  filterThread,
  sortThread,
  threadHref,
  type ThreadSide,
  type ThreadSort,
} from "@/lib/thread";
import { cx } from "@/lib/cx";
import type { ThreadNode } from "@/lib/types";

const tab = "text-mute hover:text-ink hover:no-underline";
const tabOn = "text-ink underline decoration-1 underline-offset-4 hover:text-ink hover:underline";

export function CommentThread({
  nodes,
  now,
  slug,
  side: initialSide,
  sort: initialSort,
}: {
  nodes: ThreadNode[];
  now: number;
  slug: string;
  side: ThreadSide;
  sort: ThreadSort;
}) {
  const [side, setSide] = useState(initialSide);
  const [sort, setSort] = useState(initialSort);
  const long = nodes.filter((node) => node.position?.direction === "long").length;
  const short = nodes.filter((node) => node.position?.direction === "short").length;
  const filtered = sortThread(filterThread(nodes, side), sort);
  const href = threadHref(slug, side, sort);
  const empty =
    nodes.length === 0
      ? "No comments yet. Be the first to write one."
      : side === "long"
        ? "No long takes yet."
        : side === "short"
          ? "No short takes yet."
          : "No comments yet.";

  function select(nextSide: ThreadSide, nextSort: ThreadSort, event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setSide(nextSide);
    setSort(nextSort);
    window.history.replaceState(null, "", threadHref(slug, nextSide, nextSort));
  }

  return (
    <div>
      {nodes.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-2 text-sm">
          <nav className="flex flex-wrap items-baseline gap-x-4 tabular-nums">
            {(["all", "long", "short"] as const).map((id) => (
              <a
                key={id}
                href={threadHref(slug, id, sort)}
                className={cx(side === id ? tabOn : tab)}
                onClick={(event) => select(id, sort, event)}
              >
                {id} {id === "all" ? nodes.length : id === "long" ? long : short}
              </a>
            ))}
          </nav>
          <nav className="flex items-baseline gap-x-4">
            {(["popular", "new"] as const).map((id) => (
              <a
                key={id}
                href={threadHref(slug, side, id)}
                className={cx(sort === id ? tabOn : tab)}
                onClick={(event) => select(side, id, event)}
              >
                {id}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-mute">{empty}</p>
      ) : (
        <ThreadList key={`${side}-${sort}`} nodes={filtered} now={now} href={href} slug={slug} />
      )}
    </div>
  );
}
