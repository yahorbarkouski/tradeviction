"use client";

import { flagAction, vouchAction } from "@/app/actions/comments";
import { FLAG_KARMA, VOUCH_KARMA } from "@/lib/market";

export function FlagVouch({
  commentId,
  own,
  dead,
  flagged,
  vouched,
  karma,
  next,
  signedIn,
}: {
  commentId: string;
  own: boolean;
  dead: boolean;
  flagged: boolean;
  vouched: boolean;
  karma: number;
  next: string;
  signedIn: boolean;
}) {
  if (!signedIn || own) return null;
  const canFlag = karma >= FLAG_KARMA;
  const canVouch = karma >= VOUCH_KARMA && (dead || vouched);
  if (!canFlag && !canVouch) return null;
  return (
    <>
      {canFlag ? (
        <>
          {" | "}
          <form action={flagAction} className="inline">
            <input type="hidden" name="commentId" value={commentId} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]"
            >
              {flagged ? "unflag" : "flag"}
            </button>
          </form>
        </>
      ) : null}
      {canVouch ? (
        <>
          {" | "}
          <form action={vouchAction} className="inline">
            <input type="hidden" name="commentId" value={commentId} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]"
            >
              {vouched ? "unvouch" : "vouch"}
            </button>
          </form>
        </>
      ) : null}
    </>
  );
}
