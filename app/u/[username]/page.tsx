import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminMuteAction, adminTrustAction, closeAction, logoutAction, showDeadAction } from "@/app/actions";
import { ClosePositionForm } from "@/components/PositionForm";
import { Favicon } from "@/components/Favicon";
import { MetricLabel, MetricValue } from "@/components/Metric";
import { ListSkeleton } from "@/components/Skeleton";
import { XLink } from "@/components/XLink";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  alphaRank,
  getPlayerStats,
  getUserByUsername,
  getXChallenge,
  listIpSiblings,
  listUserBook,
  listUserReceipts,
} from "@/lib/db/queries";
import { formatAlpha, formatRank, formatWhen, stanceTone, stanceWord } from "@/lib/format";
import { CONVICTION_CAP, FRESH_MS } from "@/lib/market";
import { nowMs } from "@/lib/time";
import { bookAlt, loadProfileBook } from "@/lib/share";
import { xAvatarUrl } from "@/lib/x";
import { heading, kicker } from "@/lib/ui";
import { cx } from "@/lib/cx";

const pipe =
  "cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-mute hover:underline decoration-1 underline-offset-[0.12em]";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const loaded = await loadProfileBook(username);
  if (!loaded) return { title: "not found" };
  return {
    title: loaded.user.username,
    description: bookAlt(loaded.user.username, loaded.stats.alpha, loaded.long, loaded.short),
  };
}

export default function ProfilePage({ params }: PageProps<"/u/[username]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <ProfileBody params={params} />
    </Suspense>
  );
}

async function ProfileBody({ params }: Pick<PageProps<"/u/[username]">, "params">) {
  const [{ username }, viewer] = await Promise.all([params, getCurrentUser()]);
  const user = await getUserByUsername(username);
  if (!user) notFound();
  const now = nowMs();
  const own = viewer?.id === user.id;
  const [stats, book, receipts, rank, siblings, challenge] = await Promise.all([
    getPlayerStats(user.id, now),
    listUserBook(user.id, now),
    listUserReceipts(user.id),
    alphaRank(user.id, now),
    isAdmin(viewer) ? listIpSiblings(user.id) : Promise.resolve([] as string[]),
    own ? getXChallenge(user.id) : Promise.resolve(null),
  ]);
  const longs = book.filter((line) => line.position.direction === "long");
  const shorts = book.filter((line) => line.position.direction === "short");
  const avatar = user.xAvatar ? xAvatarUrl(user.xAvatar) : null;

  return (
    <>
      <header
        className={cx("mb-5 grid gap-x-3", avatar ? "grid-cols-[40px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]")}
      >
        {avatar ? (
          // The mark spans the name and the stat row and centers on them.
          <a
            href={`https://x.com/${user.xHandle}`}
            rel="noreferrer"
            target="_blank"
            className="row-span-2 self-center leading-none hover:no-underline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" width={40} height={40} className="block h-10 w-10 rounded-full" />
          </a>
        ) : null}
        <h1 className={cx(heading, "min-w-0", avatar && "col-start-2", now - user.createdAt < FRESH_MS && "text-fresh")}>
          {user.username}
          {user.xVerified ? (
            <span className="ml-1.5 text-mute" title="verified on X">
              <BadgeCheck
                role="img"
                aria-label="verified on X"
                strokeWidth={2}
                className="inline-block h-[0.85em] w-[0.85em] align-[-0.1em]"
              />
            </span>
          ) : null}
        </h1>
        <p
          className={cx(
            "m-0 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-base tabular-nums",
            avatar && "col-start-2",
          )}
        >
            <MetricValue id="alpha" className={cx("font-medium", stats.alpha >= 0 ? "text-long" : "text-short")}>
              {formatAlpha(stats.alpha)}
            </MetricValue>
            <MetricValue id="karma" className="font-medium text-ink">
              {stats.karma.toLocaleString("en-US")}
            </MetricValue>
            <Link href="/top" className="text-mute">
              {formatRank(rank)}
            </Link>
        </p>
        <div className={cx("mt-1 min-w-0", avatar && "col-start-2")}>
          <div className="text-sm text-mute">
            joined {formatWhen(user.createdAt)}
            {" · "}
            <span title="Conviction">
              <MetricLabel id="conviction">
                {CONVICTION_CAP - stats.deployed}/{CONVICTION_CAP} left
              </MetricLabel>
            </span>
            {user.xHandle ? (
              <>
                {" · "}
                <a href={`https://x.com/${user.xHandle}`} rel="noreferrer" target="_blank">
                  @{user.xHandle}
                </a>
              </>
            ) : null}
            {own ? (
              <>
                {" · "}
                <form action={showDeadAction} className="contents">
                  <input type="hidden" name="on" value={user.showDead ? "0" : "1"} />
                  <button type="submit" className={pipe}>
                    {user.showDead ? "showdead: yes" : "showdead: no"}
                  </button>
                </form>
                {" · "}
                <form action={logoutAction} className="contents">
                  <button type="submit" className={pipe}>
                    logout
                  </button>
                </form>
                <XLink key={challenge?.code ?? "none"} xHandle={user.xHandle} challenge={challenge} now={now} />
              </>
            ) : null}
            {isAdmin(viewer) && !isAdmin(user) ? (
              <>
                {user.muted ? " · muted" : null}
                {user.trusted ? " · trusted" : null}
                {" · "}
                <form action={adminMuteAction} className="contents">
                  <input type="hidden" name="username" value={user.username} />
                  <input type="hidden" name="on" value={user.muted ? "0" : "1"} />
                  <button type="submit" className={pipe}>
                    {user.muted ? "unmute" : "mute"}
                  </button>
                </form>
                {" · "}
                <form action={adminTrustAction} className="contents">
                  <input type="hidden" name="username" value={user.username} />
                  <input type="hidden" name="on" value={user.trusted ? "0" : "1"} />
                  <button type="submit" className={pipe}>
                    {user.trusted ? "untrust" : "trust"}
                  </button>
                </form>
                {" · "}
                <Link href={`/u/${user.username}/delete`}>delete</Link>
              </>
            ) : null}
          </div>
          {siblings.length > 0 ? (
            <p className="mt-1.5 text-sm text-mute text-pretty">
              also seen from the same network:{" "}
              {siblings.map((name, i) => (
                <span key={name}>
                  {i > 0 ? ", " : null}
                  <Link href={`/u/${name}`}>{name}</Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </header>

      <div>
        <h2 className={cx(kicker, "mt-5 mb-1.5 text-long")}>long</h2>
        <BookSide lines={longs} own={own} kind="long" />
        <h2 className={cx(kicker, "mt-5 mb-1.5 text-short")}>short</h2>
        <BookSide lines={shorts} own={own} kind="short" />
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
  kind,
}: {
  lines: Awaited<ReturnType<typeof listUserBook>>;
  own: boolean;
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
