import type { Metadata } from "next";
import { TopBoards } from "@/components/TopBoards";
import { getCurrentUser } from "@/lib/auth";
import { listLeaders } from "@/lib/db/queries";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "top",
};

export default async function TopPage() {
  const now = nowMs();
  const viewer = await getCurrentUser();
  return <TopBoards board={await listLeaders(now)} viewerId={viewer?.id ?? null} />;
}
