"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { pipe } from "@/lib/ui";

// One word in the meta line that puts the full invite link on the clipboard.
export function PartyInvite({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="copy invite link"
      className={pipe}
      onClick={async () => {
        if (await copyText(`${window.location.origin}${path}`)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? "copied" : "copy invite"}
    </button>
  );
}
