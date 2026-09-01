"use client";

import { startTransition, useActionState, useState } from "react";
import { replyAction, type ActionState } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import { useAddPendingReply } from "@/components/ThreadList";
import { area, btn, ghost, quiet } from "@/lib/ui";

export function ReplyForm({ parentId, username }: { parentId: string; username: string }) {
  const [open, setOpen] = useState(false);
  const addPending = useAddPendingReply();
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const text = String(formData.get("text") ?? "").trim();
    // Shows the reply under its parent right away; the server's re-render
    // replaces it with the stored one, or drops it if the action fails.
    addPending({ id: crypto.randomUUID(), parentId, text, username, createdAt: Date.now() });
    const result = await replyAction(prev, formData);
    if (!result) startTransition(() => setOpen(false));
    return result;
  }, null as ActionState);
  if (!open) {
    return (
      <button type="button" className={quiet} onClick={() => setOpen(true)}>
        reply
      </button>
    );
  }
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="parentId" value={parentId} />
      <Honeypot />
      <textarea className={area} name="text" required minLength={2} maxLength={2000} />
      {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
      <div className="mt-3.5 flex items-center gap-5">
        <button className={btn} type="submit" disabled={pending}>
          {pending ? "sending" : "add reply"}
        </button>
        <button type="button" className={ghost} onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
    </form>
  );
}
