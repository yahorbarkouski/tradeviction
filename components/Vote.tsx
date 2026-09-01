"use client";

import Link from "next/link";
import { voteAction } from "@/app/actions";
import { cx } from "@/lib/cx";

export function Vote({
  commentId,
  own,
  voted,
  viewer,
  next,
  compact = false,
}: {
  commentId: string;
  own: boolean;
  voted: boolean;
  viewer: { id: string } | null;
  next: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <CompactVote
        commentId={commentId}
        own={own}
        voted={voted}
        viewer={viewer}
        next={next}
      />
    );
  }
  const btn =
    "inline-flex h-7 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-mono text-base leading-none hover:text-ink disabled:cursor-default";
  if (own) return null;
  if (!viewer) {
    return (
      <span className="inline-flex items-center gap-px">
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className={cx(btn, "text-mute hover:no-underline")}
          aria-label="useful"
          title="useful"
        >
          +
        </Link>
        <span className={cx(btn, "pointer-events-none text-mute")} aria-hidden>
          −
        </span>
      </span>
    );
  }
  return (
    <form action={voteAction} className="inline-flex items-center gap-px">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        name="op"
        value="up"
        disabled={voted}
        aria-label="useful"
        title="useful"
        className={cx(btn, voted ? "text-ink disabled:opacity-100" : "text-mute")}
      >
        +
      </button>
      <button
        type="submit"
        name="op"
        value="down"
        disabled={!voted}
        aria-label="remove vote"
        title="remove vote"
        className={cx(btn, "text-mute disabled:opacity-100")}
      >
        −
      </button>
    </form>
  );
}

function Arrow({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "block h-0 w-0 -translate-y-px border-x-[3.5px] border-b-[6px] border-x-transparent",
        on ? "border-b-ink" : "border-b-mute",
      )}
    />
  );
}

function CompactVote({
  commentId,
  own,
  voted,
  viewer,
  next,
}: {
  commentId: string;
  own: boolean;
  voted: boolean;
  viewer: { id: string } | null;
  next: string;
}) {
  if (own) {
    return <span className="flex h-[1.35em] w-full items-center justify-center" aria-hidden />;
  }
  const hit =
    "flex h-[1.35em] w-full items-center justify-center border-0 bg-transparent p-0 hover:[&>span]:border-b-ink";
  if (!viewer) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className={cx(hit, "hover:no-underline")}
        aria-label="useful"
        title="useful"
      >
        <Arrow on={false} />
      </Link>
    );
  }
  return (
    <form action={voteAction} className="flex h-[1.35em] w-full items-center justify-center">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        name="op"
        value={voted ? "down" : "up"}
        aria-label={voted ? "remove vote" : "useful"}
        title={voted ? "remove vote" : "useful"}
        className={hit}
      >
        <Arrow on={voted} />
      </button>
    </form>
  );
}
