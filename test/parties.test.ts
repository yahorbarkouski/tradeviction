import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPartyAction,
  deletePartyAction,
  joinPartyAction,
  leavePartyAction,
  rotateInviteAction,
} from "@/app/actions/parties";
import { adminDeleteUserAction } from "@/app/actions/users";
import {
  cachedPartyBoard,
  cachedPartyBySlug,
  getPartyByCode,
  getPartyById,
  getPartyBySlug,
  isPartyMember,
  listPartiesOf,
  listPartyBoard,
  newInviteCode,
} from "@/lib/db/parties";
import { INVITE_LENGTH, PARTY_MAX_MEMBERS, invitePath, isInviteCode, parsePartyName, partyAlt } from "@/lib/party";
import { TAG, partyTag } from "@/lib/tags";
import type { Party, Startup, User } from "@/lib/types";
import { DAY_MS } from "@/lib/time";
import { OG_CHIPS, OG_TOP } from "@/lib/og-party";
import { count, run } from "./harness/db";
import {
  actAs,
  clock,
  endorse,
  form,
  makeStartup,
  makeUser,
  openPosition,
  outcome,
  plainComment,
  type Outcome,
} from "./harness/factories";
import { cacheCalls } from "./harness/request";

function expired(): string[] {
  return [...new Set(cacheCalls.updateTag)].sort();
}

async function tagsOf(read: () => Promise<unknown>): Promise<string[]> {
  cacheCalls.cacheTag = [];
  await read();
  return [...new Set(cacheCalls.cacheTag)].sort();
}

async function create(user: User | null, fields: Record<string, string>): Promise<Outcome> {
  await actAs(user);
  return outcome(createPartyAction(null, form(fields)));
}

async function join(user: User | null, code: string, extra: Record<string, string> = {}): Promise<Outcome> {
  await actAs(user);
  return outcome(joinPartyAction(null, form({ code, ...extra })));
}

async function leave(user: User | null, party: Party): Promise<Outcome> {
  await actAs(user);
  return outcome(leavePartyAction(form({ partyId: party.id })));
}

async function makeParty(owner: User, name = "Acme"): Promise<Party> {
  const result = await create(owner, { name });
  if (!result.redirect?.startsWith("/p/")) throw new Error(`could not create party: ${result.state?.error}`);
  const party = await getPartyBySlug(result.redirect.slice("/p/".length));
  if (!party) throw new Error("party missing after create");
  return party;
}

// Joins without the rate limit's gap in the way.
async function seatMember(party: Party, user: User, at = Date.now()): Promise<void> {
  await run("INSERT INTO party_members (party_id, user_id, joined_at) VALUES (?, ?, ?)", [party.id, user.id, at]);
}

// A closed position whose one lot settled at the given Alpha.
async function settledLot(user: User, startup: Startup, alpha: number): Promise<void> {
  const positionId = randomUUID();
  const at = Date.now();
  await run(
    `INSERT INTO positions (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
     VALUES (?, ?, ?, 'long', 0, '', ?, ?, ?)`,
    [positionId, user.id, startup.id, at, at, at],
  );
  await run(
    `INSERT INTO lots (id, user_id, startup_id, position_id, direction, conviction, entry_p, entry_pulse, entry_depth, opened_at, closed_at, realized_alpha)
     VALUES (?, ?, ?, ?, 'long', 10, 0.5, 50, 0, ?, ?, ?)`,
    [randomUUID(), user.id, startup.id, positionId, at, at, alpha],
  );
}

describe("names and codes", () => {
  it.each([
    ["  Acme   engineering ", "Acme engineering"],
    ["ab", "ab"],
    ["a".repeat(40), "a".repeat(40)],
  ])("reads %j as %j", (raw, name) => {
    expect(parsePartyName(raw)).toBe(name);
  });

  it.each(["", " a ", "a".repeat(41)])("rejects %j", (raw) => {
    expect(parsePartyName(raw)).toBeNull();
  });

  it("mints long, unambiguous invite codes and recognises them", () => {
    const code = newInviteCode();
    expect(INVITE_LENGTH).toBe(32);
    expect(code).toMatch(/^[a-hj-kmnp-z2-9]{32}$/);
    expect(newInviteCode()).not.toBe(code);
    expect(isInviteCode(code)).toBe(true);
    // Codes minted before 2026-09-02 were twelve characters and still open the door.
    expect(isInviteCode("yftzq8qrdww2")).toBe(true);
    expect(isInviteCode("short")).toBe(false);
    expect(isInviteCode("a".repeat(65))).toBe(false);
    expect(isInviteCode(`${code.slice(1)}0`)).toBe(false);
    expect(invitePath(code)).toBe(`/join/${code}`);
  });

  it("describes a party for link previews", () => {
    expect(partyAlt("Acme", 1)).toBe("Acme · 1 member");
    expect(
      partyAlt("Acme", 4, [
        { username: "alice", alpha: 12.4, played: true },
        { username: "bob", alpha: -3, played: true },
        { username: "zed", alpha: 0, played: false },
        { username: "dan", alpha: 0, played: true },
      ]),
    ).toBe("Acme · 4 members · alice +12.4, bob −3, dan 0");
  });
});

describe("creating a party", () => {
  it("seats the owner, hands out an invite link, logs the write, and lands on the board", async () => {
    const owner = await makeUser();
    cacheCalls.updateTag = [];
    const result = await create(owner, { name: "Acme engineering" });
    expect(result.redirect).toBe("/p/acme-engineering");
    const party = await getPartyBySlug("acme-engineering");
    expect(party).toMatchObject({ name: "Acme engineering", ownerId: owner.id, members: 1 });
    expect(isInviteCode(party?.inviteCode ?? "")).toBe(true);
    expect(await isPartyMember(party?.id ?? "", owner.id)).toBe(true);
    expect(await count("rate_log", "kind = 'party' AND user_id = ?", [owner.id])).toBe(1);
    expect(expired()).toEqual([TAG.parties]);
  });

  it("suffixes a taken slug and falls back to 'party' for names without letters", async () => {
    clock.freeze();
    const owner = await makeUser();
    expect((await create(owner, { name: "Acme" })).redirect).toBe("/p/acme");
    clock.advance(5_000);
    expect((await create(owner, { name: "acme" })).redirect).toBe("/p/acme-2");
    clock.advance(5_000);
    expect((await create(owner, { name: "!!!" })).redirect).toBe("/p/party");
  });

  it("validates the name and turns away anonymous and honeypot submissions", async () => {
    const owner = await makeUser();
    expect((await create(owner, { name: "a" })).state?.error).toMatch(/Party name should be/);
    expect((await create(owner, { name: "x".repeat(41) })).state?.error).toMatch(/Party name should be/);
    expect((await create(null, { name: "Acme" })).redirect).toBe("/login?next=/parties");
    expect((await create(owner, { name: "Acme", website: "spam" })).redirect).toBe("/parties");
    expect(await count("parties")).toBe(0);
  });

  it("spaces party writes five seconds apart and caps them per day", async () => {
    clock.freeze();
    const owner = await makeUser();
    expect((await create(owner, { name: "First" })).redirect).toBe("/p/first");
    expect((await create(owner, { name: "Second" })).state?.error).toMatch(/too fast/);
    for (let i = 1; i < 20; i += 1) {
      clock.advance(5_000);
      expect((await create(owner, { name: `Party ${i}` })).redirect).toMatch(/^\/p\//);
    }
    clock.advance(5_000);
    expect((await create(owner, { name: "One too many" })).state?.error).toMatch(/Party limit for today/);
  });
});

describe("joining by invite link", () => {
  it("seats the member once and expires the party and the lists", async () => {
    const owner = await makeUser();
    const party = await makeParty(owner);
    const alice = await makeUser();
    cacheCalls.updateTag = [];
    expect((await join(alice, party.inviteCode)).redirect).toBe(`/p/${party.slug}`);
    expect(await isPartyMember(party.id, alice.id)).toBe(true);
    expect((await getPartyById(party.id))?.members).toBe(2);
    expect(expired()).toEqual([TAG.parties, partyTag(party.id)].sort());
    expect(await count("rate_log", "kind = 'party' AND user_id = ?", [alice.id])).toBe(1);

    // A member following the link again just lands on the board.
    cacheCalls.updateTag = [];
    expect((await join(alice, party.inviteCode)).redirect).toBe(`/p/${party.slug}`);
    expect(await count("party_members", "party_id = ?", [party.id])).toBe(2);
    expect(await count("rate_log", "kind = 'party' AND user_id = ?", [alice.id])).toBe(1);
    expect(expired()).toEqual([]);
  });

  it("refuses unknown or malformed codes without touching the rate log", async () => {
    const owner = await makeUser();
    await makeParty(owner);
    const alice = await makeUser();
    expect((await join(alice, "nope")).state?.error).toMatch(/doesn't work anymore/);
    expect((await join(alice, newInviteCode())).state?.error).toMatch(/doesn't work anymore/);
    expect(await count("rate_log", "kind = 'party' AND user_id = ?", [alice.id])).toBe(0);
  });

  it("sends anonymous visitors to login with the invite as the way back", async () => {
    const party = await makeParty(await makeUser());
    expect((await join(null, party.inviteCode)).redirect).toBe(
      `/login?next=${encodeURIComponent(invitePath(party.inviteCode))}`,
    );
    const alice = await makeUser();
    expect((await join(alice, party.inviteCode, { website: "spam" })).redirect).toBe("/parties");
    expect(await isPartyMember(party.id, alice.id)).toBe(false);
  });

  it("stops at the member cap", async () => {
    const party = await makeParty(await makeUser());
    for (let i = 1; i < PARTY_MAX_MEMBERS; i += 1) await seatMember(party, await makeUser());
    const late = await makeUser();
    expect((await join(late, party.inviteCode)).state?.error).toMatch(/full/);
    expect(await isPartyMember(party.id, late.id)).toBe(false);
  });

  it("lists a member's parties newest first with their sizes", async () => {
    clock.freeze();
    const owner = await makeUser();
    const first = await makeParty(owner, "First");
    clock.advance(5_000);
    const second = await makeParty(owner, "Second");
    const alice = await makeUser();
    await seatMember(second, alice);
    await seatMember(first, alice, Date.now() + 1);
    expect((await listPartiesOf(alice.id)).map((party) => [party.name, party.members])).toEqual([
      ["First", 2],
      ["Second", 2],
    ]);
    expect((await listPartiesOf(owner.id)).map((party) => party.name)).toEqual(["Second", "First"]);
    expect(await listPartiesOf((await makeUser()).id)).toEqual([]);
  });
});

describe("leaving", () => {
  it("removes the member and hands an owner's party to whoever joined next", async () => {
    clock.freeze();
    const owner = await makeUser();
    const party = await makeParty(owner);
    const alice = await makeUser();
    const bob = await makeUser();
    await seatMember(party, alice, Date.now() + 1_000);
    await seatMember(party, bob, Date.now() + 2_000);

    cacheCalls.updateTag = [];
    expect((await leave(bob, party)).redirect).toBe("/parties");
    expect(await isPartyMember(party.id, bob.id)).toBe(false);
    expect((await getPartyById(party.id))?.ownerId).toBe(owner.id);
    expect(expired()).toEqual([TAG.parties, partyTag(party.id)].sort());

    expect((await leave(owner, party)).redirect).toBe("/parties");
    expect((await getPartyById(party.id))?.ownerId).toBe(alice.id);
    expect((await getPartyById(party.id))?.members).toBe(1);

    // The last member out takes the party with them.
    expect((await leave(alice, party)).redirect).toBe("/parties");
    expect(await getPartyById(party.id)).toBeNull();
    expect(await count("party_members", "party_id = ?", [party.id])).toBe(0);
  });

  it("asks anonymous visitors to login and ignores parties that are gone", async () => {
    const party = await makeParty(await makeUser());
    expect((await leave(null, party)).redirect).toBe("/login?next=/parties");
    const stranger = await makeUser();
    expect((await leave(stranger, { ...party, id: "missing" })).redirect).toBe("/parties");
    expect((await getPartyById(party.id))?.members).toBe(1);
  });
});

describe("owner controls", () => {
  it("replaces the invite link so the old one stops working", async () => {
    const owner = await makeUser();
    const party = await makeParty(owner);
    const alice = await makeUser();
    await actAs(alice);
    expect((await outcome(rotateInviteAction(form({ partyId: party.id })))).redirect).toBe(`/p/${party.slug}`);
    expect((await getPartyById(party.id))?.inviteCode).toBe(party.inviteCode);

    cacheCalls.updateTag = [];
    await actAs(owner);
    expect((await outcome(rotateInviteAction(form({ partyId: party.id })))).state).toBeNull();
    const fresh = await getPartyById(party.id);
    expect(fresh?.inviteCode).not.toBe(party.inviteCode);
    expect(expired()).toEqual([TAG.parties, partyTag(party.id)].sort());
    expect(await getPartyByCode(party.inviteCode)).toBeNull();
    expect((await join(alice, party.inviteCode)).state?.error).toMatch(/doesn't work anymore/);
    expect((await join(alice, fresh?.inviteCode ?? "")).redirect).toBe(`/p/${party.slug}`);
  });

  it("lets the owner or the admin delete the party, and nobody else", async () => {
    clock.freeze();
    const owner = await makeUser();
    const party = await makeParty(owner);
    const alice = await makeUser();
    await seatMember(party, alice);
    await actAs(alice);
    expect((await outcome(deletePartyAction(form({ partyId: party.id })))).redirect).toBe(`/p/${party.slug}`);
    expect(await getPartyById(party.id)).not.toBeNull();

    const admin = await makeUser({ username: "admin" });
    cacheCalls.updateTag = [];
    await actAs(admin);
    expect((await outcome(deletePartyAction(form({ partyId: party.id })))).redirect).toBe("/parties");
    expect(await getPartyById(party.id)).toBeNull();
    expect(await count("party_members", "party_id = ?", [party.id])).toBe(0);
    expect(expired()).toEqual([TAG.parties, partyTag(party.id)].sort());

    clock.advance(5_000);
    const own = await makeParty(owner, "Mine");
    await actAs(owner);
    expect((await outcome(deletePartyAction(form({ partyId: own.id })))).redirect).toBe("/parties");
    expect(await getPartyById(own.id)).toBeNull();
  });
});

describe("the board", () => {
  it("ranks members by Alpha, keeps the ones who never bet at the bottom, and lists open bets long first", async () => {
    clock.freeze();
    const owner = await makeUser({ username: "owner" });
    const party = await makeParty(owner);
    const alice = await makeUser({ username: "alice" });
    const zed = await makeUser({ username: "zed" });
    await seatMember(party, alice);
    await seatMember(party, zed);
    const [acme, beta, gamma, closed] = await Promise.all([
      makeStartup("Acme"),
      makeStartup("Beta"),
      makeStartup("Gamma"),
      makeStartup("Closed"),
    ]);
    expect((await openPosition(owner, acme, { direction: "short", conviction: 10 })).state).toBeNull();
    clock.advance(5_000);
    expect((await openPosition(owner, beta, { direction: "long", conviction: 30 })).state).toBeNull();
    clock.advance(5_000);
    expect((await openPosition(owner, gamma, { direction: "long", conviction: 5 })).state).toBeNull();
    clock.advance(5_000);
    expect((await openPosition(owner, closed, { direction: "long", conviction: 5 })).state).toBeNull();
    clock.advance(5_000);
    expect((await openPosition(owner, closed, { close: true })).state).toBeNull();
    clock.advance(5_000);
    expect((await openPosition(alice, acme, { direction: "long", conviction: 0 })).state).toBeNull();
    const take = await plainComment(alice, acme, "an argument worth a vote");
    await endorse(take);

    const rows = await listPartyBoard(party.id, Date.now());
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    // Both players sit above the member who never bet, in Alpha order.
    expect(rows.map((row) => row.played)).toEqual([true, true, false]);
    expect(rows[0]?.alpha).toBeGreaterThanOrEqual(rows[1]?.alpha ?? Number.NaN);
    const byName = new Map(rows.map((row) => [row.username, row]));
    expect(byName.get("owner")?.bets.map((bet) => [bet.direction, bet.name, bet.conviction])).toEqual([
      ["long", "Beta", 30],
      ["long", "Gamma", 5],
      ["short", "Acme", 10],
    ]);
    expect(Number.isFinite(byName.get("owner")?.alpha)).toBe(true);
    expect(byName.get("alice")).toMatchObject({
      alpha: 0,
      karma: 1,
      bets: [{ name: "Acme", direction: "long", conviction: 0 }],
    });
    expect(byName.get("zed")).toMatchObject({ rank: 3, alpha: 0, karma: 0, bets: [] });
  });

  it("orders players by Alpha before anything else", async () => {
    const owner = await makeUser({ username: "owner" });
    const party = await makeParty(owner);
    const alice = await makeUser({ username: "alice" });
    const bob = await makeUser({ username: "bob" });
    await seatMember(party, alice);
    await seatMember(party, bob);
    const startup = await makeStartup();
    // Settled lots carry their realized Alpha as written.
    await settledLot(owner, startup, -3);
    await settledLot(alice, startup, 12.5);
    await settledLot(bob, startup, 2);
    const rows = await listPartyBoard(party.id, Date.now());
    expect(rows.map((row) => [row.username, row.alpha, row.played])).toEqual([
      ["alice", 12.5, true],
      ["bob", 2, true],
      ["owner", -3, true],
    ]);
    expect(rows.every((row) => row.bets.length === 0)).toBe(true);
  });

  it("is empty for a party nobody is in and carries the tags that expire it", async () => {
    const owner = await makeUser();
    const party = await makeParty(owner);
    expect(await tagsOf(() => cachedPartyBoard(party.id))).toEqual([TAG.leaders, TAG.world, partyTag(party.id)].sort());
    expect(await tagsOf(() => cachedPartyBySlug(party.slug))).toEqual([TAG.parties, partyTag(party.id)].sort());
    expect(await tagsOf(() => cachedPartyBySlug("no-such-party"))).toEqual([TAG.parties]);
    await run("DELETE FROM party_members WHERE party_id = ?", [party.id]);
    expect(await listPartyBoard(party.id)).toEqual([]);
  });
});

// One open position, written straight to the table so the day's move cap and
// the Conviction cap do not get in the way of a big book.
async function holdPosition(
  user: User,
  startup: Startup,
  direction: "long" | "short",
  conviction: number,
  at: number,
): Promise<void> {
  await run(
    `INSERT INTO positions (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, NULL)`,
    [randomUUID(), user.id, startup.id, direction, conviction, at, at],
  );
}

describe("a big party", () => {
  it("lists fifty companies per member in order, all members, and clips only the card", async () => {
    clock.freeze();
    const owner = await makeUser({ username: "owner" });
    const party = await makeParty(owner, "Everyone at Acme");
    const startups: Startup[] = [];
    for (let i = 0; i < 50; i += 1) startups.push(await makeStartup(`Company ${String(i).padStart(2, "0")}`));

    // The owner fills the Book through the real path, then the rest are 0-Conviction watches.
    for (const [i, startup] of startups.slice(0, 10).entries()) {
      const result = await openPosition(owner, startup, {
        direction: i % 2 === 0 ? "long" : "short",
        conviction: 10,
        note: `Take ${i}`,
      });
      expect(result.state).toBeNull();
      clock.advance(5_000);
    }
    for (const [i, startup] of startups.slice(10).entries()) {
      await holdPosition(owner, startup, i % 2 === 0 ? "long" : "short", 0, Date.now() + i);
    }
    // One closed position must not show up.
    await run(
      `INSERT INTO positions (id, user_id, startup_id, direction, conviction, note, opened_at, updated_at, closed_at)
       VALUES (?, ?, ?, 'long', 0, '', ?, ?, ?)`,
      [randomUUID(), owner.id, startups[0]?.id ?? "", Date.now() - DAY_MS, Date.now() - DAY_MS, Date.now() - 1],
    );

    // Nine more members with books of various sizes, joined through the link.
    const members: User[] = [];
    for (let m = 0; m < 9; m += 1) {
      const member = await makeUser({ username: `member${m}` });
      members.push(member);
      expect((await join(member, party.inviteCode)).redirect).toBe(`/p/${party.slug}`);
      for (const [i, startup] of startups.slice(0, m * 5).entries()) {
        await holdPosition(member, startup, i % 3 === 0 ? "short" : "long", (i % 4) + 1, Date.now() + i);
      }
    }

    const rows = await cachedPartyBoard(party.id);
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect((await getPartyById(party.id))?.members).toBe(10);

    const ownerRow = rows.find((row) => row.username === "owner");
    expect(ownerRow?.played).toBe(true);
    expect(ownerRow?.bets).toHaveLength(50);
    expect(new Set(ownerRow?.bets.map((bet) => bet.startupId)).size).toBe(50);
    // Longs first, then shorts, each side by Conviction, then by age.
    const sides = ownerRow?.bets.map((bet) => bet.direction) ?? [];
    expect(sides.indexOf("short")).toBe(25);
    expect(sides.slice(25).every((side) => side === "short")).toBe(true);
    for (const side of ["long", "short"] as const) {
      const convictions = ownerRow?.bets.filter((bet) => bet.direction === side).map((bet) => bet.conviction) ?? [];
      expect(convictions).toEqual([...convictions].sort((a, b) => b - a));
      expect(convictions.filter((n) => n === 10)).toHaveLength(5);
    }
    expect(ownerRow?.bets.every((bet) => bet.name.startsWith("Company ") && bet.domain.startsWith("company-"))).toBe(
      true,
    );

    // Everyone who bet ranks above the one member who never did.
    expect(rows.filter((row) => row.played)).toHaveLength(9);
    expect(rows[9]).toMatchObject({ username: "member0", played: false, bets: [] });
    expect(rows.find((row) => row.username === "member8")?.bets).toHaveLength(40);

    // The card takes the top five and shows at most six marks per row.
    const card = rows.slice(0, OG_TOP);
    expect(card).toHaveLength(5);
    expect(card.every((row) => row.played)).toBe(true);
    expect(Math.max(...card.map((row) => row.bets.length))).toBeGreaterThan(OG_CHIPS);
    expect(partyAlt(party.name, 10, rows)).toMatch(
      /^Everyone at Acme · 10 members · \S+ [+−]?[\d.]+, \S+ [+−]?[\d.]+, \S+ [+−]?[\d.]+$/,
    );
  });
});

describe("deleting a user", () => {
  it("drops their memberships and passes on or removes the parties they own", async () => {
    clock.freeze();
    const owner = await makeUser();
    const shared = await makeParty(owner, "Shared");
    clock.advance(5_000);
    const solo = await makeParty(owner, "Solo");
    const alice = await makeUser();
    const bob = await makeUser();
    await seatMember(shared, bob, Date.now() + 2_000);
    await seatMember(shared, alice, Date.now() + 1_000);
    const theirs = await makeParty(alice, "Alice's");
    await seatMember(theirs, owner);

    const admin = await makeUser({ username: "admin" });
    await actAs(admin);
    expect((await outcome(adminDeleteUserAction(form({ username: owner.username })))).redirect).toBe("/");
    expect(await count("users", "id = ?", [owner.id])).toBe(0);
    expect(await getPartyById(solo.id)).toBeNull();
    expect((await getPartyById(shared.id))?.ownerId).toBe(alice.id);
    expect((await getPartyById(shared.id))?.members).toBe(2);
    expect((await getPartyById(theirs.id))?.members).toBe(1);
    expect(await count("party_members", "user_id = ?", [owner.id])).toBe(0);
  });
});
