import { randomBytes, randomUUID } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { allRows, getRow, run, withTransaction } from "@/lib/db";
import { int, intish, str } from "@/lib/db/codec";
import { scorePlayers } from "@/lib/db/queries";
import { INVITE_ALPHABET, INVITE_LENGTH, PARTY_MAX_MEMBERS } from "@/lib/party";
import { slugify } from "@/lib/slug";
import { TAG, partyTag } from "@/lib/tags";
import { isDirection, type Party, type PartyBet, type PartyRow } from "@/lib/types";

export class PartyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyError";
  }
}

export function newInviteCode(): string {
  let out = "";
  for (const byte of randomBytes(INVITE_LENGTH)) out += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  return out;
}

const PARTY_SELECT = `
  SELECT p.id, p.slug, p.name, p.owner_id, p.invite_code, p.created_at,
         (SELECT COUNT(*) FROM party_members m WHERE m.party_id = p.id) AS members
  FROM parties p
`;

function parseParty(row: Record<string, unknown>): Party {
  return {
    id: str(row, "id"),
    slug: str(row, "slug"),
    name: str(row, "name"),
    ownerId: str(row, "owner_id"),
    inviteCode: str(row, "invite_code"),
    createdAt: int(row, "created_at"),
    members: intish(row, "members"),
  };
}

export async function getPartyById(id: string): Promise<Party | null> {
  const row = await getRow(`${PARTY_SELECT} WHERE p.id = ?`, [id]);
  return row ? parseParty(row) : null;
}

export async function getPartyBySlug(slug: string): Promise<Party | null> {
  const row = await getRow(`${PARTY_SELECT} WHERE p.slug = ?`, [slug]);
  return row ? parseParty(row) : null;
}

export async function getPartyByCode(code: string): Promise<Party | null> {
  const row = await getRow(`${PARTY_SELECT} WHERE p.invite_code = ?`, [code]);
  return row ? parseParty(row) : null;
}

// Shared by every viewer. Whether a viewer may see the board behind it is
// read fresh on each request, so nothing member-only lives here.
export async function cachedPartyBySlug(slug: string): Promise<Party | null> {
  "use cache";
  cacheTag(TAG.parties);
  const party = await getPartyBySlug(slug);
  if (party) {
    cacheTag(partyTag(party.id));
    cacheLife("days");
  } else {
    // The next create may take this slug.
    cacheLife("minutes");
  }
  return party;
}

export async function isPartyMember(partyId: string, userId: string): Promise<boolean> {
  const row = await getRow("SELECT 1 AS ok FROM party_members WHERE party_id = ? AND user_id = ?", [
    partyId,
    userId,
  ]);
  return row !== undefined;
}

// Newest membership first.
export async function listPartiesOf(userId: string): Promise<Party[]> {
  const rows = await allRows(
    `${PARTY_SELECT}
     JOIN party_members mine ON mine.party_id = p.id
     WHERE mine.user_id = ?
     ORDER BY mine.joined_at DESC, p.created_at DESC`,
    [userId],
  );
  return rows.map(parseParty);
}

async function uniquePartySlug(name: string): Promise<string> {
  const base = slugify(name, "party");
  let slug = base;
  let n = 2;
  while (await getRow("SELECT 1 AS ok FROM parties WHERE slug = ?", [slug])) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export async function createParty(input: { name: string; ownerId: string }): Promise<Party> {
  return await withTransaction(async () => {
    const id = randomUUID();
    const createdAt = Date.now();
    const slug = await uniquePartySlug(input.name);
    const inviteCode = newInviteCode();
    await run(
      "INSERT INTO parties (id, slug, name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, slug, input.name, input.ownerId, inviteCode, createdAt],
    );
    await run("INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)", [
      id,
      input.ownerId,
      createdAt,
    ]);
    return { id, slug, name: input.name, ownerId: input.ownerId, inviteCode, createdAt, members: 1 };
  });
}

// The party row is locked so parallel joins cannot overshoot the cap.
export async function joinParty(partyId: string, userId: string): Promise<void> {
  await withTransaction(async () => {
    const locked = await getRow("SELECT id FROM parties WHERE id = ? FOR UPDATE", [partyId]);
    if (!locked) throw new PartyError("That party is gone.");
    if (await isPartyMember(partyId, userId)) return;
    const row = await getRow("SELECT COUNT(*) AS n FROM party_members WHERE party_id = ?", [partyId]);
    if ((row ? intish(row, "n") : 0) >= PARTY_MAX_MEMBERS) {
      throw new PartyError(`This party is full (${PARTY_MAX_MEMBERS} members).`);
    }
    await run("INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)", [
      partyId,
      userId,
      Date.now(),
    ]);
  });
}

// An owner who leaves hands the party to whoever joined next; the last member
// out takes the party with them.
export async function leaveParty(partyId: string, userId: string): Promise<void> {
  await withTransaction(async () => {
    const party = await getRow("SELECT owner_id FROM parties WHERE id = ? FOR UPDATE", [partyId]);
    if (!party) return;
    await run("DELETE FROM party_members WHERE party_id = ? AND user_id = ?", [partyId, userId]);
    if (str(party, "owner_id") !== userId) return;
    const heir = await getRow(
      "SELECT user_id FROM party_members WHERE party_id = ? ORDER BY joined_at ASC LIMIT 1",
      [partyId],
    );
    if (heir) await run("UPDATE parties SET owner_id = ? WHERE id = ?", [str(heir, "user_id"), partyId]);
    else await run("DELETE FROM parties WHERE id = ?", [partyId]);
  });
}

export async function rotateInvite(partyId: string): Promise<string> {
  const code = newInviteCode();
  await run("UPDATE parties SET invite_code = ? WHERE id = ?", [code, partyId]);
  return code;
}

export async function deleteParty(partyId: string): Promise<void> {
  await withTransaction(async () => {
    await run("DELETE FROM party_members WHERE party_id = ?", [partyId]);
    await run("DELETE FROM parties WHERE id = ?", [partyId]);
  });
}

type Member = { userId: string; username: string; createdAt: number; verified: boolean };

async function listMembers(partyId: string): Promise<Member[]> {
  const rows = await allRows(
    `SELECT u.id, u.username, u.created_at, u.x_verified
     FROM party_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.party_id = ?`,
    [partyId],
  );
  return rows.map((row) => ({
    userId: str(row, "id"),
    username: str(row, "username"),
    createdAt: int(row, "created_at"),
    verified: intish(row, "x_verified") === 1,
  }));
}

// Every member ranked by Alpha, with their open positions. Members who have
// never bet sit at the bottom so a fresh company party still lists everyone.
export async function listPartyBoard(partyId: string, now = Date.now()): Promise<PartyRow[]> {
  const members = await listMembers(partyId);
  if (members.length === 0) return [];
  const ids = members.map((member) => member.userId);
  const ph = ids.map(() => "?").join(",");
  const [scores, betRows] = await Promise.all([
    scorePlayers(ids, now),
    allRows(
      `SELECT p.user_id, p.direction, p.conviction, s.id AS startup_id, s.slug, s.name, s.domain
       FROM positions p
       JOIN startups s ON s.id = p.startup_id
       WHERE p.closed_at IS NULL AND p.user_id IN (${ph})
       ORDER BY p.direction ASC, p.conviction DESC, p.opened_at ASC`,
      ids,
    ),
  ]);
  const betsByUser = new Map<string, PartyBet[]>();
  for (const row of betRows) {
    const direction = str(row, "direction");
    if (!isDirection(direction)) continue;
    const userId = str(row, "user_id");
    const list = betsByUser.get(userId) ?? [];
    list.push({
      startupId: str(row, "startup_id"),
      slug: str(row, "slug"),
      name: str(row, "name"),
      domain: str(row, "domain"),
      direction,
      conviction: int(row, "conviction"),
    });
    betsByUser.set(userId, list);
  }
  const rows = members.map((member) => {
    const score = scores.get(member.userId);
    const bets = betsByUser.get(member.userId) ?? [];
    return {
      ...member,
      alpha: score?.alpha ?? 0,
      karma: score?.karma ?? 0,
      played: (score?.played ?? false) || bets.length > 0,
      bets,
      rank: 0,
    };
  });
  rows.sort(
    (a, b) =>
      Number(b.played) - Number(a.played) ||
      b.alpha - a.alpha ||
      b.karma - a.karma ||
      a.username.localeCompare(b.username),
  );
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

// One board per party, shared by its members; expired by any book change,
// any vote, and any change to who is in the party.
export async function cachedPartyBoard(partyId: string): Promise<PartyRow[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.world, TAG.leaders, partyTag(partyId));
  return listPartyBoard(partyId, Date.now());
}
