"use client";

import { useActionState } from "react";
import { createPartyAction } from "@/app/actions/parties";
import { Honeypot } from "@/components/Honeypot";
import { PARTY_NAME_MAX, PARTY_NAME_MIN } from "@/lib/party";
import { btn, fieldHead, input } from "@/lib/ui";

export function PartyForm() {
  const [state, action, pending] = useActionState(createPartyAction, null);
  return (
    <form action={action} className="max-w-md">
      <Honeypot />
      <label className={fieldHead} htmlFor="name">
        new party
      </label>
      <input
        className={input}
        id="name"
        name="name"
        required
        minLength={PARTY_NAME_MIN}
        maxLength={PARTY_NAME_MAX}
        autoComplete="off"
        placeholder="Acme engineering"
      />
      {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
      <button className={`mt-3.5 ${btn}`} type="submit" disabled={pending}>
        {pending ? "Creating" : "Create party"}
      </button>
    </form>
  );
}
