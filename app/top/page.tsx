import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/Skeleton";
import { TopBoards } from "@/components/TopBoards";
import { getCurrentUser } from "@/lib/auth";
import { cachedLeaders } from "@/lib/db/scores";

export const metadata: Metadata = {
  title: "top",
};

export default function TopPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={10} />}>
      <TopBody />
    </Suspense>
  );
}

async function TopBody() {
  const [board, viewer] = await Promise.all([cachedLeaders(), getCurrentUser()]);
  return <TopBoards board={board} viewerId={viewer?.id ?? null} />;
}
