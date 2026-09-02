import Link from "next/link";
import { leavePartyAction, rotateInviteAction } from "@/app/actions";
import { Favicon } from "@/components/Favicon";
import { MetricHead } from "@/components/Metric";
import { PartyInvite } from "@/components/PartyInvite";
import { UserLink } from "@/components/UserLink";
import { cx } from "@/lib/cx";
import { formatAlpha, formatWhen } from "@/lib/format";
import { invitePath } from "@/lib/party";
import { heading, kicker, num, pipe } from "@/lib/ui";
import type { Party, PartyBet, PartyRow } from "@/lib/types";

const cols = "grid grid-cols-[2.5ch_minmax(0,1fr)_6ch_4ch] gap-x-1.5";

export function PartyBoard({
  party,
  rows,
  viewerId,
  member,
  manager,
  now,
}: {
  party: Party;
  rows: PartyRow[];
  viewerId: string;
  // False for an admin looking in from outside.
  member: boolean;
  // The owner, or an admin.
  manager: boolean;
  now: number;
}) {
  return (
    <>
      <header className="mb-5">
        <h1 className={heading}>{party.name}</h1>
        {/* A div, not a p: the inline forms below may not sit inside a paragraph. */}
        <div className="text-sm text-mute">
          {party.members} {party.members === 1 ? "member" : "members"}
          {" · "}since {formatWhen(party.createdAt)}
          {" · "}
          <PartyInvite path={invitePath(party.inviteCode)} />
          {member ? (
            <>
              {" · "}
              <form action={leavePartyAction} className="contents">
                <input type="hidden" name="partyId" value={party.id} />
                <button type="submit" className={pipe}>
                  leave
                </button>
              </form>
            </>
          ) : null}
          {manager ? (
            <>
              {" · "}
              <form action={rotateInviteAction} className="contents">
                <input type="hidden" name="partyId" value={party.id} />
                <button type="submit" className={pipe} title="Replace the invite link. The old one stops working.">
                  new link
                </button>
              </form>
              {" · "}
              <Link href={`/p/${party.slug}/delete`}>delete</Link>
            </>
          ) : null}
        </div>
      </header>
      <section>
        <header className={cx(cols, "items-center pb-1.5 leading-none")}>
          <span />
          <h2 className={cx(kicker, "m-0")}>Top</h2>
          <MetricHead id="alpha" className="justify-end" />
          <MetricHead id="karma" className="justify-end" />
        </header>
        <ol className="m-0 list-none p-0">
          {rows.map((row) => (
            <BoardRow
              key={row.userId}
              row={row}
              own={row.userId === viewerId}
              owner={row.userId === party.ownerId}
              now={now}
            />
          ))}
        </ol>
      </section>
    </>
  );
}

function BoardRow({ row, own, owner, now }: { row: PartyRow; own: boolean; owner: boolean; now: number }) {
  return (
    <li className="pt-1 pb-2">
      <div className={cx(cols, "items-baseline")}>
        <span className="flex justify-end font-mono text-sm tabular-nums text-mute">{row.rank}.</span>
        <div className="min-w-0 truncate">
          <UserLink username={row.username} createdAt={row.createdAt} now={now} verified={row.verified} />
          {own ? <span className="text-mute"> you</span> : null}
          {owner ? <span className="text-sm text-mute"> · owner</span> : null}
        </div>
        <span
          className={cx(
            num,
            "flex justify-end whitespace-nowrap",
            row.played ? (row.alpha >= 0 ? "text-long" : "text-short") : "text-mute",
          )}
        >
          {row.played ? formatAlpha(row.alpha) : "—"}
        </span>
        <span className={cx(num, "flex justify-end whitespace-nowrap")}>{row.karma.toLocaleString("en-US")}</span>
      </div>
      <div className={cx(cols, "mt-1")}>
        <span />
        <Bets bets={row.bets} className="col-span-3" />
      </div>
    </li>
  );
}

// Open positions as company marks: a green border for long, red for short,
// biggest Conviction first. Inactive positions (0 Conviction) are faded.
function Bets({ bets, className }: { bets: PartyBet[]; className?: string }) {
  if (bets.length === 0) return <span className={cx("text-sm text-mute", className)}>no positions yet</span>;
  return (
    <span className={cx("flex flex-wrap gap-1", className)}>
      {bets.map((bet) => (
        <BetChip key={bet.startupId} bet={bet} />
      ))}
    </span>
  );
}

function BetChip({ bet }: { bet: PartyBet }) {
  const active = bet.conviction >= 1;
  const label = `${bet.direction} ${bet.name}${active ? ` · ${bet.conviction}` : " · inactive"}`;
  return (
    <Link
      href={`/s/${bet.slug}`}
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex rounded-[3px] border-2 bg-paper p-px hover:no-underline hover:opacity-70",
        bet.direction === "long" ? "border-long" : "border-short",
        !active && "opacity-40",
      )}
    >
      <Favicon domain={bet.domain} name={bet.name} size={18} />
    </Link>
  );
}
