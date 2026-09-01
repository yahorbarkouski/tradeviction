import Link from "next/link";
import { CommentThread } from "@/components/CommentThread";
import { Favicon } from "@/components/Favicon";
import { PositionForm, StanceLinks } from "@/components/PositionForm";
import { PulseBoard } from "@/components/StanceSplit";
import { isAdmin, seesDead } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  countDeployed,
  getBookLine,
  getKarma,
  getMarket,
  listThread,
  movesLeft,
} from "@/lib/db/queries";
import { nowMs } from "@/lib/time";
import { isThreadSide, isThreadSort } from "@/lib/thread";
import { heading } from "@/lib/ui";
import type { Direction, Startup } from "@/lib/types";

export async function StartupView({
  startup,
  preset,
  searchParams,
}: {
  startup: Startup;
  preset: Direction | null;
  searchParams: Promise<{ side?: string; sort?: string }>;
}) {
  const query = await searchParams;
  const now = nowMs();
  const viewer = await getCurrentUser();
  const [market, thread, line] = await Promise.all([
    getMarket(startup.id, now),
    listThread(startup.id, viewer?.id ?? null, seesDead(viewer), now),
    viewer ? getBookLine(startup.id, viewer.id, now) : Promise.resolve(null),
  ]);
  const side = query.side && isThreadSide(query.side) ? query.side : "all";
  const sort = query.sort && isThreadSort(query.sort) ? query.sort : "popular";

  return (
    <>
      <header className="mb-1 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3">
        <a href={startup.url} rel="noreferrer" target="_blank" className="block leading-none hover:no-underline">
          <Favicon domain={startup.domain} name={startup.name} size={40} />
        </a>
        <div className="min-w-0">
          <h1 className={heading}>{startup.name}</h1>
          {startup.description ? (
            <p className="m-0 mb-1 text-base text-pretty">{startup.description}</p>
          ) : null}
          <p className="m-0 text-sm text-mute">
            <a href={startup.url} rel="noreferrer" target="_blank">
              {startup.domain}
            </a>
            {startup.source === "hn" && startup.sourceId ? (
              <>
                {" · "}
                <a href={`https://news.ycombinator.com/item?id=${startup.sourceId}`} rel="noreferrer" target="_blank">
                  Show HN
                </a>
              </>
            ) : null}
            {isAdmin(viewer) ? (
              <>
                {" · "}
                <Link href={`/s/${startup.slug}/edit`}>edit</Link>
                {" · "}
                <Link href={`/s/${startup.slug}/delete`}>delete</Link>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <PulseBoard slug={startup.slug} market={market} />

      {viewer ? (
        <PositionForm
          key={preset ?? "open"}
          startupId={startup.id}
          line={line}
          deployed={await countDeployed(viewer.id)}
          movesRemaining={await movesLeft(viewer.id, now)}
          username={viewer.username}
          preset={preset}
        />
      ) : (
        <StanceLinks slug={startup.slug} preset={preset} />
      )}

      <hr className="my-7 mb-2 border-0 border-t border-line" />
      <CommentThread
        nodes={thread}
        viewer={viewer}
        now={now}
        slug={startup.slug}
        side={side}
        sort={sort}
        karma={viewer ? await getKarma(viewer.id, now) : 0}
      />
    </>
  );
}
