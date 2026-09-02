"use client";

import { useSyncExternalStore } from "react";

const MINUTE = 60_000;

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, MINUTE);
  return () => window.clearInterval(id);
}

function minuteNow(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

// Cached server output carries the time its entry was built. Hydration keeps
// that value so the markup matches, then the browser clock takes over, to the
// minute, so relative ages stay honest while the page sits open.
export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribe, minuteNow, () => serverNow);
}
