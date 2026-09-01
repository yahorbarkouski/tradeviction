import Link from "next/link";
import { FaceSlightlySmiling } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { MetricValue } from "@/components/Metric";
import { Nav } from "@/components/Nav";
import { UserLink } from "@/components/UserLink";
import { getKarma, getPlayerAlpha } from "@/lib/db/queries";
import { formatAlpha } from "@/lib/format";
import { nowMs } from "@/lib/time";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const now = nowMs();
  const alpha = user ? await getPlayerAlpha(user.id, now) : 0;
  const karma = user ? await getKarma(user.id, now) : 0;
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-line py-4 leading-none md:grid-cols-[auto_minmax(0,1fr)_auto] md:py-5 [&_a]:hover:text-ink [&_a]:hover:no-underline">
      <Link href="/" className="flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap">
        <FaceSlightlySmiling size={16} strokeWidth={2} aria-hidden className="shrink-0" />
        Tradeviction
      </Link>
      <div className="flex min-w-0 items-center justify-end gap-3 justify-self-end text-mute tabular-nums md:col-start-3">
        {user ? (
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
        ) : (
          <Link href="/login">login</Link>
        )}
      </div>
      <Nav className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1" />
    </header>
  );
}
