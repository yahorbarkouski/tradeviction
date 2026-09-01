"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { submitStartupAction } from "@/app/actions";
import { Favicon } from "@/components/Favicon";
import { Honeypot } from "@/components/Honeypot";
import { cx } from "@/lib/cx";
import { faviconDomain } from "@/lib/domain";
import type { LookupHit } from "@/lib/types";
import { btn, fieldHead, input } from "@/lib/ui";

export function SubmitForm() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<{ q: string; hits: LookupHit[] } | null>(null);
  const [state, action, pending] = useActionState(submitStartupAction, null);

  useEffect(() => {
    const q = url.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/lookup?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((res) => res.json())
        .then((body: unknown) => {
          if (
            typeof body === "object" &&
            body !== null &&
            "hits" in body &&
            Array.isArray(body.hits)
          ) {
            setResult({ q, hits: body.hits.filter(isHit) });
          }
        })
        .catch(() => {
          return;
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [url]);

  const q = url.trim();
  const shown = result && result.q === q ? result.hits : [];
  const exact = shown.find((hit) => hit.exact) ?? null;
  const iconDomain = faviconDomain(url);
  const iconName = iconDomain?.split("/")[0]?.split(".")[0] ?? "";

  return (
    <form action={action} className="flex max-w-md flex-col gap-3.5">
      <Honeypot />
      <div>
        <label className={fieldHead} htmlFor="url">
          url or domain
        </label>
        <div className="flex items-stretch">
          <input
            className={cx(input, "min-w-0 max-w-none flex-1", iconDomain && "border-r-0")}
            id="url"
            name="url"
            value={url}
            required
            autoComplete="off"
            placeholder="linear.app"
            onChange={(e) => setUrl(e.target.value)}
          />
          {iconDomain ? (
            <span className="flex aspect-square shrink-0 items-center justify-center border border-line p-1">
              <Favicon domain={iconDomain} name={iconName} size={32} />
            </span>
          ) : null}
        </div>
      </div>
      {exact ? (
        <div className="border border-line p-4">
          <div className="mb-1 text-mute">Already listed</div>
          <Link href={`/s/${exact.slug}`} className="mb-1 flex items-center gap-2 font-medium tracking-[-0.01em]">
            <Favicon domain={exact.domain} name={exact.name} size={20} />
            {exact.name}
          </Link>
          <div className="text-sm text-mute">
            {exact.domain}
            {exact.description ? ` · ${exact.description}` : ""}
          </div>
          <p className="mt-2 text-sm text-mute">
            {exact.domain.includes("/")
              ? "This repo is already on the site."
              : `www and app.${exact.domain} count as the same company.`}
          </p>
          <Link href={`/s/${exact.slug}`} className={`${btn} mt-3.5 hover:no-underline`}>
            Open {exact.name}
          </Link>
        </div>
      ) : (
        <>
          {shown.length > 0 ? (
            <ul className="list-none overflow-hidden border border-line p-0" role="listbox">
              {shown.map((hit) => (
                <li key={hit.slug} className="border-t border-soft first:border-t-0">
                  <Link href={`/s/${hit.slug}`} className="flex items-start gap-2 px-3 py-2.5 hover:bg-bg hover:no-underline">
                    <Favicon domain={hit.domain} name={hit.name} size={20} />
                    <span>
                      <strong>{hit.name}</strong>
                      <span className="text-mute"> {hit.domain}</span>
                      {hit.description ? <div className="text-sm text-mute">{hit.description}</div> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <label className={fieldHead} htmlFor="name">
              company name
            </label>
            <input className={input} id="name" name="name" required minLength={2} maxLength={80} />
          </div>
          <div>
            <label className={fieldHead} htmlFor="description">
              one-liner
            </label>
            <input className={input} id="description" name="description" required minLength={8} maxLength={200} />
          </div>
          {state?.error ? <p className="text-short">{state.error}</p> : null}
          <button className={`${btn} self-start`} type="submit" disabled={pending}>
            submit
          </button>
        </>
      )}
    </form>
  );
}

function isHit(value: unknown): value is LookupHit {
  if (typeof value !== "object" || value === null) return false;
  if (!("slug" in value) || typeof value.slug !== "string") return false;
  if (!("name" in value) || typeof value.name !== "string") return false;
  if (!("description" in value) || typeof value.description !== "string") return false;
  if (!("domain" in value) || typeof value.domain !== "string") return false;
  if (!("url" in value) || typeof value.url !== "string") return false;
  if (!("exact" in value) || typeof value.exact !== "boolean") return false;
  return true;
}