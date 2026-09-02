"use client";

import { useActionState } from "react";
import { joinPartyAction } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import { btn } from "@/lib/ui";

export function JoinPartyForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(joinPartyAction, null);
  return (
    <form action={action}>
      <Honeypot />
      <input type="hidden" name="code" value={code} />
      {state?.error ? <p className="mb-2 text-short">{state.error}</p> : null}
      <button className={btn} type="submit" disabled={pending}>
        {pending ? "Joining" : "Join"}
      </button>
    </form>
  );
}
