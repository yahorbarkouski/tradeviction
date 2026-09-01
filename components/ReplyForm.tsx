"use client";

import { useActionState, useState } from "react";
import { replyAction } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import { area, btn, ghost, quiet } from "@/lib/ui";

export function ReplyForm({ parentId, next }: { parentId: string; next: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(replyAction, null);
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
      <input type="hidden" name="next" value={next} />
      <Honeypot />
      <textarea className={area} name="text" required minLength={2} maxLength={2000} />
      {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
      <div className="mt-3.5 flex items-center gap-5">
        <button className={btn} type="submit" disabled={pending}>
          add reply
        </button>
        <button type="button" className={ghost} onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
    </form>
  );
}