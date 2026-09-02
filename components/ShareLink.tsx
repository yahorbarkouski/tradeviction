"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

const plain =
  "cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]";

// Copies the absolute link for a path and says so for a moment.
export function ShareLink({
  path,
  label = "share",
  copiedLabel = "copied",
  className = plain,
}: {
  path: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="copy link"
      className={className}
      onClick={async () => {
        if (await copyText(new URL(path, window.location.origin).toString())) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
