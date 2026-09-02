import { cacheLife, cacheTag } from "next/cache";
import { isAdmin, seesDead } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { getKarma, getPlayerAlpha, listViewerMarks } from "@/lib/db/queries";
import type { ViewerMarks } from "@/lib/marks";
import { TAG } from "@/lib/tags";

export type { ViewerMarks } from "@/lib/marks";

export type ViewerStats = {
  alpha: number;
  karma: number;
};

// Browser-cached only; cleared whenever an action calls updateTag("session").
export async function getViewerMarks(): Promise<ViewerMarks | null> {
  "use cache: private";
  cacheLife({ stale: 300 });
  cacheTag(TAG.session);
  const user = await getCurrentUser();
  if (!user) return null;
  const [karma, marks] = await Promise.all([getKarma(user.id, Date.now()), listViewerMarks(user.id)]);
  return {
    id: user.id,
    username: user.username,
    admin: isAdmin(user),
    showDead: seesDead(user),
    karma,
    ...marks,
  };
}

export async function getViewerStats(userId: string): Promise<ViewerStats> {
  "use cache: private";
  cacheLife({ stale: 300 });
  cacheTag(TAG.session);
  const now = Date.now();
  const [alpha, karma] = await Promise.all([getPlayerAlpha(userId, now), getKarma(userId, now)]);
  return { alpha, karma };
}
