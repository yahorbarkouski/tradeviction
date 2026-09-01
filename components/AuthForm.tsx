"use client";

import { useActionState, useRef, useState } from "react";
import type { ActionState } from "@/app/actions";
import { loginAction, registerAction } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import { Turnstile } from "@/components/Turnstile";
import { btn, field, input } from "@/lib/ui";

export function AuthForm({
  mode,
  next,
  turnstileSiteKey = "",
}: {
  mode: "login" | "register";
  next: string;
  turnstileSiteKey?: string;
}) {
  const action = mode === "login" ? loginAction : registerAction;
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const needTurnstile = turnstileSiteKey.length > 0;
  const turnstileAction = mode === "login" ? "login" : "signup";
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      try {
        return await action(previous, formData);
      } finally {
        if (widgetId.current !== null && window.turnstile) {
          window.turnstile.reset(widgetId.current);
          setToken("");
        }
      }
    },
    null as ActionState,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      <Honeypot />
      <label className={field} htmlFor="username">
        username
      </label>
      <input
        className={input}
        id="username"
        name="username"
        autoComplete="username"
        required
        minLength={2}
        maxLength={20}
        pattern="[A-Za-z][A-Za-z0-9_]{1,19}"
      />
      <label className={field} htmlFor="password">
        password
      </label>
      <input
        className={input}
        id="password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={mode === "register" ? 8 : 1}
      />
      {needTurnstile ? (
        <>
          <input type="hidden" name="cf-turnstile-response" value={token} />
          <Turnstile
            siteKey={turnstileSiteKey}
            action={turnstileAction}
            onToken={setToken}
            widgetIdRef={widgetId}
          />
        </>
      ) : null}
      {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
      <button
        className={`mt-3.5 ${btn}`}
        type="submit"
        disabled={pending || (needTurnstile && !token)}
      >
        {mode === "login" ? "login" : "create account"}
      </button>
    </form>
  );
}
