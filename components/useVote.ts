"use client";

import { useActionState, useOptimistic } from "react";
import { voteAction, type ActionState } from "@/app/actions";

// The arrow flips and the count moves on the click; the server's re-render
// confirms or reverts it when the action settles.
export function useVote(voted: boolean, points: number) {
  const [optimisticVoted, setOptimisticVoted] = useOptimistic(voted);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    setOptimisticVoted(String(formData.get("op") ?? "up") !== "down");
    return voteAction(prev, formData);
  }, null as ActionState);
  const delta = optimisticVoted === voted ? 0 : optimisticVoted ? 1 : -1;
  return {
    voted: optimisticVoted,
    points: points + delta,
    action,
    pending,
    error: state?.error ?? null,
  };
}
