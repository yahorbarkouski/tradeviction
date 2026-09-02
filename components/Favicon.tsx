"use client";

import { useEffect, useRef, useState } from "react";
import { iconMark, iconSources } from "@/lib/icon";

function isGenericFavicon(img: HTMLImageElement): boolean {
  return img.naturalWidth < 32 || img.naturalHeight < 32;
}

export function Favicon({
  domain,
  name,
  size = 40,
}: {
  domain: string;
  name: string;
  size?: number;
}) {
  const sources = iconSources(domain, 64);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [shownDomain, setShownDomain] = useState(domain);
  const skip = useRef(false);
  const mark = iconMark(name, domain, size);
  const src = sources[index];
  const imgRef = useRef<HTMLImageElement>(null);

  // A new domain starts the source list over.
  if (shownDomain !== domain) {
    setShownDomain(domain);
    setIndex(0);
    setReady(false);
  }

  useEffect(() => {
    skip.current = false;
    const img = imgRef.current;
    if (img) adopt(img);
  }, [src]);

  function adopt(img: HTMLImageElement) {
    if (!img.complete || img.naturalWidth === 0) return;
    if (isGenericFavicon(img)) {
      if (skip.current) return;
      skip.current = true;
      setReady(false);
      setIndex((n) => n + 1);
      return;
    }
    setReady(true);
  }

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {ready ? null : (
        <span
          className="font-mono font-medium leading-none tracking-[-0.06em] text-ink"
          style={{ fontSize: mark.length > 1 ? size * 0.44 : size * 0.56 }}
        >
          {mark}
        </span>
      )}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className="absolute inset-0 size-full object-contain transition-opacity duration-150"
          style={{ opacity: ready ? 1 : 0 }}
          src={src}
          alt=""
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => adopt(event.currentTarget)}
          onError={() => {
            setReady(false);
            setIndex((n) => n + 1);
          }}
        />
      ) : null}
    </span>
  );
}
