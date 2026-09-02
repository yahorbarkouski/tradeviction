// Party rules shared by the server and the browser. Nothing here touches the
// database or node APIs, so Client Components may import it.
import { SITE_LINE } from "@/lib/copy";
import { formatAlpha } from "@/lib/format";

export const PARTY_NAME_MIN = 2;
export const PARTY_NAME_MAX = 40;
export const PARTY_MAX_MEMBERS = 200;

// No i, l, o, 0, or 1: the link gets pasted into chats and read off screens.
export const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
// 32 symbols of 31 is about 158 bits: the link is the whole secret, and no
// amount of guessing through the rate limit finds one.
export const INVITE_LENGTH = 32;
// Codes minted before 2026-09-02 were twelve characters and still open the door.
const INVITE_MIN_LENGTH = 12;
const INVITE_MAX_LENGTH = 64;

export function parsePartyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < PARTY_NAME_MIN || name.length > PARTY_NAME_MAX) return null;
  return name;
}

export function isInviteCode(value: string): boolean {
  return (
    value.length >= INVITE_MIN_LENGTH &&
    value.length <= INVITE_MAX_LENGTH &&
    [...value].every((ch) => INVITE_ALPHABET.includes(ch))
  );
}

// The page never shows the code; a copy button carries the whole link.
export function invitePath(code: string): string {
  return `/join/${code}`;
}

// One line for link previews: the party, its size, and who leads it.
export function partyAlt(
  name: string,
  members: number,
  top: { username: string; alpha: number; played: boolean }[] = [],
): string {
  const lead = `${name} · ${members} ${members === 1 ? "member" : "members"}`;
  const ranked = top
    .filter((row) => row.played)
    .slice(0, 3)
    .map((row) => `${row.username} ${formatAlpha(row.alpha)}`);
  return ranked.length > 0 ? `${lead} · ${ranked.join(", ")}` : lead;
}

export function partyTitle(name: string, members: number): string {
  return `${name} · party of ${members}`;
}

export function partyBlurb(
  name: string,
  members: number,
  top: { username: string; alpha: number; played: boolean }[] = [],
): string {
  const ranked = top.filter((row) => row.played).slice(0, 3);
  const first = ranked[0];
  const rest = ranked.slice(1).map((row) => `${row.username} ${formatAlpha(row.alpha)}`);
  const lead =
    first === undefined
      ? `${name} is a private leaderboard of ${members}. Nobody has played yet.`
      : rest.length === 0
        ? `${name} is a private leaderboard of ${members}. ${first.username} leads at ${formatAlpha(first.alpha)}.`
        : `${name} is a private leaderboard of ${members}. ${first.username} leads at ${formatAlpha(first.alpha)}, then ${rest.join(" and ")}.`;
  return `${lead} ${SITE_LINE}`;
}

export function inviteTitle(name: string): string {
  return `Join ${name} on Tradeviction`;
}

export function inviteBlurb(
  name: string,
  members: number,
  top: { username: string; alpha: number; played: boolean }[] = [],
): string {
  const leader = top.find((row) => row.played);
  const who = leader ? ` ${leader.username} leads at ${formatAlpha(leader.alpha)}.` : "";
  return `You're invited to ${name}, a private leaderboard of ${members}.${who} Call startups long or short and see if you can beat them.`;
}
