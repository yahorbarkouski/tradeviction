"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminUpdateStartupAction } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import type { Startup } from "@/lib/types";
import { btn, fieldHead, ghost, input } from "@/lib/ui";

export function EditStartupForm({ startup }: { startup: Startup }) {
  const [state, action, pending] = useActionState(adminUpdateStartupAction, null);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3.5">
      <Honeypot />
      <input type="hidden" name="startupId" value={startup.id} />
      <div>
        <label className={fieldHead} htmlFor="url">
          url or domain
        </label>
        <input className={input} id="url" name="url" required defaultValue={startup.url} autoComplete="off" />
      </div>
      <div>
        <label className={fieldHead} htmlFor="name">
          company name
        </label>
        <input
          className={input}
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={startup.name}
        />
      </div>
      {state?.error ? <p className="text-short">{state.error}</p> : null}
      <div className="flex items-center gap-5">
        <button className={btn} type="submit" disabled={pending}>
          save
        </button>
        <Link href={`/s/${startup.slug}`} className={ghost}>
          cancel
        </Link>
      </div>
    </form>
  );
}
