"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";

const note = "whitespace-nowrap text-xs text-short";

type VoteProps = {
  commentId: string;
  own: boolean;
  voted: boolean;
  signedIn: boolean;
  next: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
  compact?: boolean;
};

export function Vote(props: VoteProps) {
  if (props.compact) return <CompactVote {...props} />;
  const { commentId, own, voted, signedIn, next, action, pending, error } = props;
  const btn =
    "inline-flex h-7 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 font-mono text-base leading-none hover:text-ink disabled:cursor-default";
  if (own) return null;
  if (!signedIn) {
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
    <form action={action} className="inline-flex items-center gap-px">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        name="op"
        value="up"
        disabled={voted || pending}
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
        disabled={!voted || pending}
        aria-label="remove vote"
        title="remove vote"
        className={cx(btn, "text-mute disabled:opacity-100")}
      >
        −
      </button>
      {error ? (
        <span role="status" className={cx(note, "ml-1.5")}>
          {error}
        </span>
      ) : null}
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

function CompactVote({ commentId, own, voted, signedIn, next, action, pending, error }: VoteProps) {
  if (own) {
    return <span className="flex h-[1.35em] w-full items-center justify-center" aria-hidden />;
  }
  const hit =
    "flex h-[1.35em] w-full items-center justify-center border-0 bg-transparent p-0 hover:[&>span]:border-b-ink";
  if (!signedIn) {
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
    <form action={action} className="relative flex h-[1.35em] w-full items-center justify-center">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        name="op"
        value={voted ? "down" : "up"}
        disabled={pending}
        aria-label={voted ? "remove vote" : "useful"}
        title={voted ? "remove vote" : "useful"}
        className={hit}
      >
        <Arrow on={voted} />
      </button>
      {error ? (
        <span
          role="status"
          className={cx(note, "absolute top-0 left-full z-10 ml-1.5 bg-paper px-1 leading-[1.35em]")}
        >
          {error}
        </span>
      ) : null}
    </form>
  );
}
