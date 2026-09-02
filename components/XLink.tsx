"use client";

import { useActionState, useState } from "react";
import { xStartAction, xUnlinkAction, xVerifyAction } from "@/app/actions";
import { Confirm } from "@/components/Confirm";
import { copyText } from "@/lib/clipboard";
import type { XChallenge } from "@/lib/types";

const pipe =
  "cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em] disabled:cursor-default disabled:opacity-60";
const field =
  "inline-block w-36 border border-line bg-transparent px-2 py-1 font-sans text-sm text-ink placeholder:text-mute/60";

// The code, as a button that puts itself on the clipboard.
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        title="copy"
        aria-label={`copy ${code}`}
        className="cursor-pointer border-0 bg-transparent p-0 font-mono text-sm text-ink hover:underline decoration-1 underline-offset-[0.12em]"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {code}
      </button>
      {copied ? <span className="ml-1 text-mute">copied</span> : null}
    </>
  );
}

// Inline X controls for the profile owner, continuing the meta line. Mount it
// with a key derived from the challenge so a fresh code closes the form.
export function XLink({
  xHandle,
  challenge,
  now,
}: {
  xHandle: string | null;
  challenge: XChallenge | null;
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  const [startState, start, starting] = useActionState(xStartAction, null);
  const [verifyState, verify, verifying] = useActionState(xVerifyAction, null);
  if (xHandle) {
    return (
      <>
        {" · "}
        <Confirm action={xUnlinkAction} label="unlink X" className={pipe} />
      </>
    );
  }
  const live = challenge && challenge.expiresAt > now ? challenge : null;
  return (
    <>
      {live ? null : (
        <>
          {" · "}
          <button type="button" className={pipe} onClick={() => setEditing((open) => !open)}>
            link X
          </button>
        </>
      )}
      {live ? (
        <span className="mt-1.5 block text-pretty">
          Add <CopyCode code={live.code} /> to the bio of{" "}
          <a href={`https://x.com/${live.handle}`} rel="noreferrer" target="_blank">
            @{live.handle}
          </a>
          , then{" "}
          <form action={verify} className="contents">
            <button type="submit" className={pipe} disabled={verifying}>
              {verifying ? "verifying" : "verify"}
            </button>
          </form>
          {" · "}
          <button type="button" className={pipe} onClick={() => setEditing((open) => !open)}>
            change handle
          </button>
          {verifyState?.error ? <span className="text-short"> · {verifyState.error}</span> : null}
        </span>
      ) : null}
      {editing ? (
        <form action={start} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <input
            className={field}
            name="handle"
            placeholder="@name"
            autoComplete="off"
            required
            maxLength={80}
            aria-label="X handle"
          />
          <button type="submit" className={pipe} disabled={starting}>
            {starting ? "checking" : "get code"}
          </button>
          {startState?.error ? <span className="text-short">{startState.error}</span> : null}
        </form>
      ) : null}
    </>
  );
}
