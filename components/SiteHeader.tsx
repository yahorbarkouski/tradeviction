import Link from "next/link";
import { FaceSlightlySmiling } from "lucide-react";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { MetricValue } from "@/components/Metric";
import { Nav } from "@/components/Nav";
import { UserLink } from "@/components/UserLink";
import { formatAlpha } from "@/lib/format";
import { cachedNow } from "@/lib/clock";
import { getViewerStats } from "@/lib/viewer";

// Logo and nav are static. Only the viewer chip waits on the session, behind
// its own boundary, so the shell never blocks on a cookie.
export function SiteHeader() {
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-line py-4 leading-none md:grid-cols-[auto_minmax(0,1fr)_auto] md:py-5 [&_a]:hover:text-ink [&_a]:hover:no-underline">
      <Link href="/" prefetch={true} className="flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap">
        <FaceSlightlySmiling size={16} strokeWidth={2} aria-hidden className="shrink-0" />
        Tradeviction
      </Link>
      <div className="flex min-w-0 items-center justify-end gap-3 justify-self-end text-mute tabular-nums md:col-start-3">
        <Suspense fallback={<span className="invisible">login</span>}>
          <ViewerChip />
        </Suspense>
      </div>
      <Nav className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1" />
    </header>
  );
}

async function ViewerChip() {
  const user = await getCurrentUser();
  if (!user) return <Link href="/login">login</Link>;
  const { alpha, karma } = await getViewerStats(user.id);
  const now = await cachedNow();
  return (
    <>
      <Link href={`/u/${user.username}`} className="flex shrink-0 items-center gap-3 font-mono">
        <MetricValue id="alpha" className={alpha >= 0 ? "text-long" : "text-short"}>
          {formatAlpha(alpha)}
        </MetricValue>
        <MetricValue id="karma" className="text-ink">
          {karma.toLocaleString("en-US")}
        </MetricValue>
      </Link>
      <UserLink username={user.username} createdAt={user.createdAt} now={now} className="min-w-0 truncate" />
    </>
  );
}
