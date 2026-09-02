import { describe, expect, it } from "vitest";
import { voteAction } from "@/app/actions";
import { getCommentById, setMuted, setTrusted } from "@/lib/db/queries";
import { PROVISIONAL_WEIGHT } from "@/lib/market";
import { count } from "./harness/db";
import {
  actAs,
  clock,
  establish,
  form,
  frontPage,
  makeStartup,
  makeUser,
  outcome,
  plainComment,
  thesis,
  vote,
} from "./harness/factories";

describe("voting", () => {
  it("counts a brand-new account's vote at once, at provisional weight", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const id = await thesis(alice, startup);

    const result = await vote(bob, id);
    expect(result.state).toBeNull();
    expect(result.redirect).toBeNull();

    const seen = await getCommentById(id, bob.id);
    expect(seen?.points).toBe(1);
    expect(seen?.score).toBeCloseTo(PROVISIONAL_WEIGHT);
    const page = await frontPage(bob);
    expect(page.items[0]?.voted).toBe(true);
    expect(await count("rate_log", "kind = 'vote' AND user_id = ?", [bob.id])).toBe(1);
  });

  it("refuses votes on your own comment", async () => {
    const alice = await makeUser();
    const id = await thesis(alice, await makeStartup());
    const result = await vote(alice, id);
    expect(result.state?.error).toMatch(/own comment/);
    expect(await count("comment_votes")).toBe(0);
  });

  it("removes a vote with op=down and ignores repeats", async () => {
    clock.freeze();
    const alice = await makeUser();
    const bob = await makeUser();
    const id = await thesis(alice, await makeStartup());
    await vote(bob, id);
    clock.advance(2001);
    await vote(bob, id);
    expect(await count("comment_votes")).toBe(1);
    clock.advance(2001);
    expect((await vote(bob, id, "down")).state).toBeNull();
    expect(await count("comment_votes")).toBe(0);
    clock.advance(2001);
    expect((await vote(bob, id, "down")).state).toBeNull();
    expect(await count("comment_votes")).toBe(0);
  });

  it("asks for a two second pause between votes and shows how long to wait", async () => {
    clock.freeze();
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const first = await plainComment(alice, startup, "first");
    const second = await plainComment(alice, startup, "second");
    expect((await vote(bob, first)).state).toBeNull();
    clock.advance(500);
    const blocked = await vote(bob, second);
    expect(blocked.state?.error).toMatch(/too fast.*Retry in 2 seconds/);
    expect(await count("comment_votes")).toBe(1);
    clock.advance(1500);
    expect((await vote(bob, second)).state).toBeNull();
    expect(await count("comment_votes")).toBe(2);
  });

  it("caps an account at forty votes an hour", async () => {
    clock.freeze();
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const ids: string[] = [];
    for (let i = 0; i < 41; i += 1) ids.push(await plainComment(alice, startup, `comment ${i}`));
    for (let i = 0; i < 40; i += 1) {
      const result = await vote(bob, ids[i] ?? "");
      expect(result.state).toBeNull();
      clock.advance(2001);
    }
    expect((await vote(bob, ids[40] ?? "")).state?.error).toMatch(/Vote limit for this hour/);
    clock.advance(3_600_000);
    expect((await vote(bob, ids[40] ?? "")).state).toBeNull();
    expect(await count("comment_votes")).toBe(41);
  });

  it("admits exactly one of two simultaneous votes", async () => {
    clock.freeze();
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const first = await plainComment(alice, startup, "first");
    const second = await plainComment(alice, startup, "second");
    await actAs(bob);
    const results = await Promise.all([
      outcome(voteAction(null, form({ commentId: first, op: "up" }))),
      outcome(voteAction(null, form({ commentId: second, op: "up" }))),
    ]);
    expect(results.filter((r) => r.state === null)).toHaveLength(1);
    expect(results.filter((r) => /too fast/.test(r.state?.error ?? ""))).toHaveLength(1);
    expect(await count("comment_votes")).toBe(1);
  });

  it("sends anonymous voters to login and reports missing comments", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const id = await thesis(alice, startup);
    await actAs(null);
    const anonymous = await outcome(voteAction(null, form({ commentId: id })));
    expect(anonymous.redirect).toBe(`/login?next=${encodeURIComponent(`/s/${startup.slug}`)}`);
    await actAs(alice);
    const missing = await outcome(voteAction(null, form({ commentId: "nope" })));
    expect(missing.state?.error).toBe("Comment not found.");
  });
});

describe("vote weight", () => {
  it("weighs established, trusted, provisional, and muted voters as 1, 1, 0.1, and 0", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const id = await thesis(alice, startup);

    const established = await makeUser();
    await establish(established);
    const trusted = await makeUser({ trusted: true });
    const provisional = await makeUser();
    const muted = await makeUser({ muted: true });
    for (const voter of [established, trusted, provisional, muted]) {
      expect((await vote(voter, id)).state).toBeNull();
    }

    const seen = await getCommentById(id);
    expect(await count("comment_votes", "comment_id = ?", [id])).toBe(4);
    expect(seen?.points).toBe(3);
    expect(seen?.score).toBeCloseTo(2 + PROVISIONAL_WEIGHT);
  });

  it("needs both the age and the three touched startups to count in full", async () => {
    const alice = await makeUser();
    const id = await thesis(alice, await makeStartup());
    const oldButNarrow = await makeUser();
    await establish(oldButNarrow, { touches: 2 });
    const wideButYoung = await makeUser();
    await establish(wideButYoung, { ageMs: 6 * 24 * 3_600_000 });
    await vote(oldButNarrow, id);
    await vote(wideButYoung, id);
    expect((await getCommentById(id))?.score).toBeCloseTo(2 * PROVISIONAL_WEIGHT);
  });

  it("matures a provisional vote in place once the voter is established", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const id = await thesis(alice, await makeStartup());
    await vote(bob, id);
    expect((await getCommentById(id))?.score).toBeCloseTo(PROVISIONAL_WEIGHT);
    await establish(bob);
    expect((await getCommentById(id))?.score).toBeCloseTo(1);
    await setMuted(bob.id, true);
    const muted = await getCommentById(id);
    expect(muted?.score).toBe(0);
    expect(muted?.points).toBe(0);
  });

  it("lets trust flip the front page order at read time", async () => {
    clock.freeze();
    const alice = await makeUser();
    const bob = await makeUser();
    const carol = await makeUser();
    const older = await thesis(alice, await makeStartup(), "T1 older thesis about the first company.");
    clock.advance(5001);
    const newer = await thesis(alice, await makeStartup(), "T2 newer thesis about the second company.");

    await vote(bob, newer);
    await vote(carol, older);
    expect((await frontPage()).texts).toEqual([
      "T2 newer thesis about the second company.",
      "T1 older thesis about the first company.",
    ]);

    await setTrusted(carol.id, true);
    const page = await frontPage();
    expect(page.texts).toEqual([
      "T1 older thesis about the first company.",
      "T2 newer thesis about the second company.",
    ]);
    expect(page.items[0]?.score).toBeCloseTo(1);
    expect(page.items[1]?.score).toBeCloseTo(PROVISIONAL_WEIGHT);
    expect(page.items.map((item) => item.points)).toEqual([1, 1]);

    await setTrusted(carol.id, false);
    expect((await frontPage()).texts[0]).toBe("T2 newer thesis about the second company.");
  });
});
