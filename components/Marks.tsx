"use client";

import { createContext, use, type ReactNode } from "react";
import type { ViewerMarks } from "@/lib/marks";

const MarksContext = createContext<Promise<ViewerMarks | null> | null>(null);

// Carries the viewer's marks (votes, flags, vouches, standing) as a promise so
// the public, cached list renders at once and each row's controls resolve on
// their own inside a Suspense boundary.
export function MarksProvider({
  marks,
  children,
}: {
  marks: Promise<ViewerMarks | null>;
  children: ReactNode;
}) {
  return <MarksContext value={marks}>{children}</MarksContext>;
}

// Suspends until the marks arrive. Call it inside a <Suspense> boundary.
export function useMarks(): ViewerMarks | null {
  const marks = use(MarksContext);
  if (!marks) return null;
  return use(marks);
}
