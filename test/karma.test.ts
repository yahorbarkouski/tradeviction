import { describe, expect, it } from "vitest";
import { applyBookChange, getKarma, getPlayerStats, listLeaders } from "@/lib/db/queries";
import { KARMA_DAY_CAP, KARMA_PAIR_CAP } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { clock, establish, makeStartup, makeUser, plainComment, vote } from "./harness/factories";

describe("karma", () => {
  it("counts votes from accounted voters only", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const comment = await plainComment(alice, startup);
    await vote(await makeUser(), comment);
    expect(await getKarma(alice.id)).toBe(0);
    await vote(await makeUser({ trusted: true }), comment);
    expect(await getKarma(alice.id)).toBe(1);
    const established = await makeUser();
    await establish(established);
    await vote(established, comment);
    expect(await getKarma(alice.id)).toBe(2);
    await vote(await makeUser({ muted: true }), comment);
    expect(await getKarma(alice.id)).toBe(2);
  });

  it("skips the returning half of a reciprocal pair inside thirty days", async () => {
    clock.freeze();
    const a = await makeUser({ trusted: true });
    const b = await makeUser({ trusted: true });
    const startup = await makeStartup();
    const byA = await plainComment(a, startup, "by a");
    const byB = await plainComment(b, startup, "by b");
    await vote(a, byB);
    expect(await getKarma(b.id)).toBe(1);
    clock.advance(DAY_MS);
    await vote(b, byA);
    expect(await getKarma(a.id)).toBe(0);
    expect(await getKarma(b.id)).toBe(1);

    const c = await makeUser({ trusted: true });
    const d = await makeUser({ trusted: true });
    const byC = await plainComment(c, startup, "by c");
    const byD = await plainComment(d, startup, "by d");
    await vote(c, byD);
    clock.advance(31 * DAY_MS);
    await vote(d, byC);
    expect(await getKarma(c.id)).toBe(1);
    expect(await getKarma(d.id)).toBe(1);
  });

  it("counts at most three votes from one voter per thirty days", async () => {
    clock.freeze();
    const alice = await makeUser();
    const voter = await makeUser({ trusted: true });
    const startup = await makeStartup();
    const ids: string[] = [];
    for (let i = 0; i < KARMA_PAIR_CAP + 2; i += 1) ids.push(await plainComment(alice, startup, `c${i}`));
    for (let i = 0; i < KARMA_PAIR_CAP + 1; i += 1) {
      await vote(voter, ids[i] ?? "");
      clock.advance(2001);
    }
    expect(await getKarma(alice.id)).toBe(KARMA_PAIR_CAP);
    clock.advance(31 * DAY_MS);
    await vote(voter, ids[KARMA_PAIR_CAP + 1] ?? "");
    expect(await getKarma(alice.id)).toBe(KARMA_PAIR_CAP + 1);
  });

  it("counts at most twenty votes per UTC day", async () => {
    clock.set(Date.parse("2026-09-02T10:00:00.000Z"));
    const alice = await makeUser();
    const startup = await makeStartup();
    const comment = await plainComment(alice, startup);
    for (let i = 0; i < KARMA_DAY_CAP + 1; i += 1) await vote(await makeUser({ trusted: true }), comment);
    expect(await getKarma(alice.id)).toBe(KARMA_DAY_CAP);
    clock.advance(DAY_MS);
    await vote(await makeUser({ trusted: true }), comment);
    expect(await getKarma(alice.id)).toBe(KARMA_DAY_CAP + 1);
  });
});

describe("player stats and leaderboards", () => {
  it("reports established standing", async () => {
    const fresh = await makeUser();
    const trusted = await makeUser({ trusted: true });
    const established = await makeUser();
    await establish(established);
    const mutedEstablished = await makeUser({ muted: true });
    await establish(mutedEstablished);
    expect((await getPlayerStats(fresh.id)).established).toBe(false);
    expect((await getPlayerStats(trusted.id)).established).toBe(true);
    expect((await getPlayerStats(established.id)).established).toBe(true);
    expect((await getPlayerStats(mutedEstablished.id)).established).toBe(false);
  });

  it("ranks karma among users who have it and alpha among users with lots", async () => {
    const alice = await makeUser({ username: "alice" });
    const bob = await makeUser({ username: "bob" });
    await makeUser({ username: "carol" });
    const startup = await makeStartup();
    const byAlice = await plainComment(alice, startup, "alice says");
    const byBob = await plainComment(bob, startup, "bob says");
    for (let i = 0; i < 2; i += 1) await vote(await makeUser({ trusted: true }), byAlice);
    await vote(await makeUser({ trusted: true }), byBob);
    await applyBookChange({ startupId: startup.id, userId: alice.id, direction: "long", conviction: 10, note: "" });

    const board = await listLeaders();
    expect(board.karma.map((row) => [row.username, row.karma])).toEqual([
      ["alice", 2],
      ["bob", 1],
    ]);
    expect(board.alpha.map((row) => row.username)).toEqual(["alice"]);
  });
});
