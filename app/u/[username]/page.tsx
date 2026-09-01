import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { closeAction, logoutAction, showDeadAction, adminMuteAction } from "@/app/actions";
import { ClosePositionForm } from "@/components/PositionForm";
import { Favicon } from "@/components/Favicon";
import { MetricLabel } from "@/components/Metric";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  alphaRank,
  getPlayerStats,
  getUserByUsername,
  listUserBook,
  listUserReceipts,
} from "@/lib/db/queries";
import { formatAlpha, formatRank, formatWhen, stanceTone, stanceWord } from "@/lib/format";
import { FRESH_MS } from "@/lib/market";
import { nowMs } from "@/lib/time";
import { bookAlt, loadProfileBook } from "@/lib/share";
import { heading, kicker } from "@/lib/ui";
import { cx } from "@/lib/cx";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const loaded = await loadProfileBook(username);
  if (!loaded) return { title: "not found" };
  return {
    title: loaded.user.username,
    description: bookAlt(loaded.user.username, loaded.stats.alpha, loaded.long, loaded.short),
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) notFound();
  const now = nowMs();
  const stats = await getPlayerStats(user.id, now);
  const book = await listUserBook(user.id, now);
  const receipts = await listUserReceipts(user.id);
  const longs = book.filter((line) => line.position.direction === "long");
  const shorts = book.filter((line) => line.position.direction === "short");
  const viewer = await getCurrentUser();
  const own = viewer?.id === user.id;
  const rank = await alphaRank(user.id, now);

  return (
    <>
      <h1 className={cx(heading, now - user.createdAt < FRESH_MS && "text-fresh")}>{user.username}</h1>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-base tabular-nums">
        <span>
          <MetricLabel id="alpha">Alpha</MetricLabel>{" "}
          <strong className={cx("font-medium", stats.alpha >= 0 ? "text-long" : "text-short")}>
            {formatAlpha(stats.alpha)}
          </strong>
        </span>
        <span>
          <MetricLabel id="karma">Karma</MetricLabel>{" "}
          <strong className="font-medium">{stats.karma.toLocaleString("en-US")}</strong>
        </span>
        <Link href="/top" className="text-mute">
          {formatRank(rank)}
        </Link>
      </div>
      <div className="text-sm text-mute">
        joined {formatWhen(user.createdAt)} ·{" "}
        <MetricLabel id="conviction">
          {stats.deployed}/100 deployed
        </MetricLabel>{" "}
        · {stats.movesLeft} moves left today
        {own ? (
          <>
            {" · "}
            <form action={showDeadAction} className="contents">
              <input type="hidden" name="on" value={user.showDead ? "0" : "1"} />
              <button
                type="submit"
                className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]"
              >
                {user.showDead ? "showdead: yes" : "showdead: no"}
              </button>
            </form>
            {" · "}
            <form action={logoutAction} className="contents">
              <button
                type="submit"
                className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]"
              >
                logout
              </button>
            </form>
          </>
        ) : null}
        {isAdmin(viewer) && !isAdmin(user) ? (
          <>
            {user.muted ? " · muted" : null}
            {" · "}
            <form action={adminMuteAction} className="contents">
              <input type="hidden" name="username" value={user.username} />
              <input type="hidden" name="on" value={user.muted ? "0" : "1"} />
              <button
                type="submit"
                className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]"
              >
                {user.muted ? "unmute" : "mute"}
              </button>
            </form>
            {" · "}
            <Link href={`/u/${user.username}/delete`}>delete</Link>
          </>
        ) : null}
      </div>

      <div className="mt-4">
        <h2 className={cx(kicker, "mt-5 mb-1.5 text-long")}>long</h2>
        <BookSide lines={longs} own={own} username={user.username} kind="long" />
        <h2 className={cx(kicker, "mt-5 mb-1.5 text-short")}>short</h2>
        <BookSide lines={shorts} own={own} username={user.username} kind="short" />
        {receipts.length > 0 ? (
          <>
            <h2 className={cx(kicker, "mt-5 mb-1.5")}>Receipts</h2>
            <ul className="m-0 list-none p-0">
              {receipts.map((receipt) => (
                <li
                  className="mb-2 pt-0.5 pb-1.5 tabular-nums"
                  key={`${receipt.startup.id}-${receipt.openedAt}`}
                >
                  <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-1.5">
                    <Favicon domain={receipt.startup.domain} name={receipt.startup.name} size={20} />
                    <div className="min-w-0">
                      <Link href={`/s/${receipt.startup.slug}`}>{receipt.startup.name}</Link>
                      <div className="text-sm text-mute">
                        <span className={stanceTone(receipt.direction)}>{stanceWord(receipt.direction)}</span>{" "}
                        {receipt.entryPulse}→{receipt.exitPulse}
                        {" · depth "}
                        {receipt.entryDepth}
                        {" · "}
                        {receipt.conviction}
                      </div>
                    </div>
                    <span className={receipt.alpha >= 0 ? "text-long" : "text-short"}>
                      {formatAlpha(receipt.alpha)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}

function BookSide({
  lines,
  own,
  username,
  kind,
}: {
  lines: Awaited<ReturnType<typeof listUserBook>>;
  own: boolean;
  username: string;
  kind: "long" | "short";
}) {
  if (lines.length === 0) return <p className="text-mute">none</p>;
  return (
    <ul className="m-0 list-none p-0">
      {lines.map((line) => (
        <li className="pt-0.5 pb-1.5" key={line.position.id}>
          <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-1.5">
            <Favicon domain={line.startup.domain} name={line.startup.name} size={20} />
            <div className="min-w-0">
              <div>
                <Link href={`/s/${line.startup.slug}`}>{line.startup.name}</Link>
                {" "}
                <span className={cx("font-mono tabular-nums", stanceTone(kind))}>
                  {line.position.conviction >= 1 ? line.position.conviction : "inactive"}
                </span>
              </div>
              <div className="text-sm text-mute">
                {line.entryPulse}→{line.pulse}
                {line.entryDepth > 0 ? ` · d${line.entryDepth}` : ""}
                {" · "}
                <span className={line.liveAlpha >= 0 ? "text-long" : "text-short"}>
                  {formatAlpha(line.liveAlpha)}
                </span>
                {line.discoveryAlpha !== 0 ? (
                  <span className="text-mute"> · disc {formatAlpha(line.discoveryAlpha)}</span>
                ) : null}
                {line.daysEarly !== null ? <span className="text-mute"> · {line.daysEarly}d early</span> : null}
              </div>
              {line.position.note ? (
                <p className="mt-1.5 mb-0 text-pretty">{line.position.note}</p>
              ) : null}
            </div>
            {own ? (
              <div className="self-center">
                <ClosePositionForm
                  startupId={line.startup.id}
                  direction={line.position.direction}
                  conviction={line.position.conviction}
                  next={`/u/${username}`}
                  action={closeAction}
                />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}