"use client";

import { useActionState, useState } from "react";
import { adminDeleteCommentAction, adminUpdateCommentAction } from "@/app/actions";
import { isAdmin } from "@/lib/admin";
import { area, btn, ghost } from "@/lib/ui";
import type { User } from "@/lib/types";

const pipe =
  "cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]";

export function AdminCommentMeta({
  commentId,
  viewer,
  next,
  onEdit,
}: {
  commentId: string;
  viewer: User | null;
  next: string;
  onEdit: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!isAdmin(viewer)) return null;
  return (
    <>
      {" | "}
      <button type="button" className={pipe} onClick={onEdit}>
        edit
      </button>
      {" | "}
      {confirm ? (
        <form action={adminDeleteCommentAction} className="inline">
          <input type="hidden" name="commentId" value={commentId} />
          <input type="hidden" name="next" value={next} />
          <button type="submit" className={pipe}>
            yes
          </button>
          {" / "}
          <button type="button" className={pipe} onClick={() => setConfirm(false)}>
            no
          </button>
        </form>
      ) : (
        <button type="button" className={pipe} onClick={() => setConfirm(true)}>
          delete
        </button>
      )}
    </>
  );
}

export function AdminCommentEdit({
  commentId,
  text,
  next,
  onCancel,
}: {
  commentId: string;
  text: string;
  next: string;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(adminUpdateCommentAction, null);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="next" value={next} />
      <textarea className={area} name="text" required minLength={2} maxLength={2000} defaultValue={text} />
      {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
      <div className="mt-3.5 flex items-center gap-5">
        <button className={btn} type="submit" disabled={pending}>
          save
        </button>
        <button type="button" className={ghost} onClick={onCancel}>
          cancel
        </button>
      </div>
    </form>
  );
}
