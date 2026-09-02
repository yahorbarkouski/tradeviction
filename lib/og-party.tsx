import { cachedPartyBoard } from "@/lib/db/parties";
import { formatAlpha } from "@/lib/format";
import { iconLetter } from "@/lib/icon";
import { CONTENT_W, INK, LINE, LONG, MONO, MUTE, SANS, SHORT, Shell, Wordmark, faviconSrc, ogImage } from "@/lib/og";
import { TITLE_TYPE, measureText, truncateToWidth } from "@/lib/og-fit";
import { clip } from "@/lib/share";
import type { Party, PartyBet, PartyRow } from "@/lib/types";

// The party card: the top five, each with their Alpha and their open bets.
export const OG_TOP = 5;
// The chip lane is 554px wide and a chip takes 52, so ten fit; when a row
// overflows, one chip gives way to the count.
export const OG_CHIPS = 10;
const OG_CHIPS_WITH_MORE = OG_CHIPS - 1;

const PAPER = "#fffdfa";

export type PartyIcons = Record<string, string | null>;

export async function partyIcons(rows: PartyRow[]): Promise<PartyIcons> {
  const domains = [...new Set(rows.flatMap((row) => row.bets.slice(0, OG_CHIPS).map((bet) => bet.domain)))];
  const pairs = await Promise.all(domains.map(async (domain) => [domain, await faviconSrc(domain, 64)] as const));
  return Object.fromEntries(pairs);
}

// The invite link unfurls with the same board under a "Join" heading.
export async function partyImage(party: Party, invite = false) {
  const rows = (await cachedPartyBoard(party.id)).slice(0, OG_TOP);
  return ogImage(
    <PartyOg name={party.name} members={party.members} rows={rows} icons={await partyIcons(rows)} invite={invite} />,
  );
}

const TITLE_SIZE = 48;
const JOIN_GAP = 14;

function Chip({ bet, src }: { bet: PartyBet; src: string | null }) {
  const color = bet.direction === "long" ? LONG : SHORT;
  return (
    <div
      style={{
        display: "flex",
        width: 44,
        height: 44,
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
        border: `3px solid ${color}`,
        borderRadius: 6,
        backgroundColor: PAPER,
        opacity: bet.conviction >= 1 ? 1 : 0.4,
      }}
    >
      {src ? (
        <img src={src} width={28} height={28} alt="" style={{ objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", fontSize: 18, fontFamily: MONO, fontWeight: 500, color: INK }}>
          {iconLetter(bet.name, bet.domain)}
        </div>
      )}
    </div>
  );
}

function Row({ row, icons }: { row: PartyRow; icons: PartyIcons }) {
  const tone = !row.played ? MUTE : row.alpha >= 0 ? LONG : SHORT;
  const bets = row.bets.slice(0, row.bets.length > OG_CHIPS ? OG_CHIPS_WITH_MORE : OG_CHIPS);
  const extra = row.bets.length - bets.length;
  return (
    <div style={{ display: "flex", alignItems: "center", height: 60 }}>
      <div style={{ display: "flex", width: 48, fontSize: 22, fontFamily: MONO, fontWeight: 500, color: MUTE }}>
        {`${row.rank}.`}
      </div>
      <div style={{ display: "flex", width: 320, fontSize: 28, fontFamily: SANS, fontWeight: 500, color: INK }}>
        {clip(row.username, 20)}
      </div>
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center" }}>
        {bets.length === 0 ? (
          <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>no positions yet</div>
        ) : (
          bets.map((bet) => <Chip key={bet.startupId} bet={bet} src={icons[bet.domain] ?? null} />)
        )}
        {extra > 0 ? (
          <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>{`+${extra}`}</div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          width: 150,
          justifyContent: "flex-end",
          fontSize: 28,
          fontFamily: MONO,
          fontWeight: 500,
          color: tone,
        }}
      >
        {row.played ? formatAlpha(row.alpha) : "—"}
      </div>
    </div>
  );
}

export function PartyOg({
  name,
  members,
  rows,
  icons,
  invite = false,
}: {
  name: string;
  members: number;
  rows: PartyRow[];
  icons: PartyIcons;
  // True on the invite link: the heading reads "Join" in mute before the name.
  invite?: boolean;
}) {
  const joinW = invite ? measureText("Join", TITLE_SIZE, TITLE_TYPE) + JOIN_GAP : 0;
  const title = truncateToWidth(name, TITLE_SIZE, CONTENT_W - joinW, TITLE_TYPE);
  return (
    <Shell
      meta={
        <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>
          {`${members} ${members === 1 ? "member" : "members"} · ranked by alpha`}
        </div>
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Wordmark size={24} />
        <div style={{ display: "flex", fontSize: 20, color: MUTE, fontFamily: SANS }}>party</div>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: TITLE_SIZE,
          fontWeight: 600,
          fontFamily: SANS,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        {invite ? <div style={{ display: "flex", marginRight: JOIN_GAP, color: MUTE }}>Join</div> : null}
        <div style={{ display: "flex" }}>{title}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ display: "flex", marginTop: 36, fontSize: 28, color: MUTE, fontFamily: SANS }}>
          nobody has joined yet
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
          {rows.map((row, index) => (
            <div key={row.userId} style={{ display: "flex", flexDirection: "column" }}>
              {index > 0 ? <div style={{ display: "flex", height: 1, backgroundColor: LINE }} /> : null}
              <Row row={row} icons={icons} />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
