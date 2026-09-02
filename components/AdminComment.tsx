"use client";

import { useActionState } from "react";
import { adminDeleteCommentAction, adminUpdateCommentAction, deleteCommentAction } from "@/app/actions";
import { Confirm } from "@/components/Confirm";
import { area, btn, ghost } from "@/lib/ui";

const pipe =
  "cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]";

// The author can delete their own comment. The admin can also edit anyone's.
export function AdminCommentMeta({
  commentId,
  admin,
  own,
  next,
  onEdit,
}: {
  commentId: string;
  admin: boolean;
  own: boolean;
  next: string;
  onEdit: () => void;
}) {
  if (!admin && !own) return null;
  return (
    <>
      {admin ? (
        <>
          {" | "}
          <button type="button" className={pipe} onClick={onEdit}>
            edit
          </button>
        </>
      ) : null}
      {" | "}
      <Confirm action={admin ? adminDeleteCommentAction : deleteCommentAction} label="delete" className={pipe}>
        <input type="hidden" name="commentId" value={commentId} />
        <input type="hidden" name="next" value={next} />
      </Confirm>
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
