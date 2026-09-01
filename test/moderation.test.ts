import { describe, expect, it } from "vitest";
import { flagAction } from "@/app/actions";
import { isAdmin, seesDead } from "@/lib/admin";
import { getCommentById, getKarma } from "@/lib/db/queries";
import { FLAG_KARMA, FLAG_KILL, VOUCH_KARMA } from "@/lib/market";
import type { User } from "@/lib/types";
import { count, run } from "./harness/db";
import { actAs, clock, flag, form, makeStartup, makeUser, outcome, plainComment, vote, vouch } from "./harness/factories";

async function giveKarma(user: User, n: number): Promise<void> {
  const comment = await plainComment(user, await makeStartup(), "karma bait");
  for (let i = 0; i < n; i += 1) await vote(await makeUser({ trusted: true }), comment);
  expect(await getKarma(user.id)).toBe(n);
}

async function addFlags(commentId: string, n: number, opts: { muted?: boolean } = {}): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const flagger = await makeUser({ muted: opts.muted });
    await run("INSERT INTO comment_flags (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
      commentId,
      flagger.id,
      Date.now(),
    ]);
  }
}

async function addVouches(commentId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const voucher = await makeUser();
    await run("INSERT INTO comment_vouches (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
      commentId,
      voucher.id,
      Date.now(),
    ]);
  }
}

describe("flagging", () => {
  it("needs karma before a flag lands, then toggles", async () => {
    const author = await makeUser();
    const target = await plainComment(author, await makeStartup(), "target");
    const flagger = await makeUser();
    await giveKarma(flagger, FLAG_KARMA - 1);
    await flag(flagger, target);
    expect(await count("comment_flags")).toBe(0);

    const trusted = await makeUser({ trusted: true });
    const bait = await plainComment(flagger, await makeStartup(), "more bait");
    await vote(trusted, bait);
    expect(await getKarma(flagger.id)).toBe(FLAG_KARMA);
    expect((await flag(flagger, target)).state).toBeNull();
    expect(await count("comment_flags")).toBe(1);
    expect((await getCommentById(target, flagger.id))?.flagged).toBe(true);
    clock.freeze();
    clock.advance(2001);
    await flag(flagger, target);
    expect(await count("comment_flags")).toBe(0);
  });

  it("never lands on your own comment and ignores muted or anonymous flaggers", async () => {
    const author = await makeUser();
    await giveKarma(author, FLAG_KARMA);
    const own = await plainComment(author, await makeStartup(), "mine");
    await flag(author, own);
    expect(await count("comment_flags")).toBe(0);

    const muted = await makeUser({ muted: true });
    await giveKarma(muted, FLAG_KARMA);
    await flag(muted, own);
    expect(await count("comment_flags")).toBe(0);

    await actAs(null);
    const result = await outcome(flagAction(form({ commentId: own })));
    expect(result.redirect).toMatch(/^\/login\?next=/);
  });

  it("spaces flags two seconds apart and caps them at thirty an hour", async () => {
    clock.freeze();
    const author = await makeUser();
    const startup = await makeStartup();
    const flagger = await makeUser();
    await giveKarma(flagger, FLAG_KARMA);
    const ids: string[] = [];
    for (let i = 0; i < 31; i += 1) ids.push(await plainComment(author, startup, `c${i}`));

    await flag(flagger, ids[0] ?? "");
    await flag(flagger, ids[1] ?? "");
    expect(await count("comment_flags")).toBe(1);
    for (let i = 1; i < 30; i += 1) {
      clock.advance(2001);
      await flag(flagger, ids[i] ?? "");
    }
    expect(await count("comment_flags")).toBe(30);
    clock.advance(2001);
    await flag(flagger, ids[30] ?? "");
    expect(await count("comment_flags")).toBe(30);
    clock.advance(3_600_000);
    await flag(flagger, ids[30] ?? "");
    expect(await count("comment_flags")).toBe(31);
  });
});

describe("dead comments", () => {
  it("die at three flags and revive once vouches catch up", async () => {
    const author = await makeUser();
    const target = await plainComment(author, await makeStartup(), "target");
    await addFlags(target, FLAG_KILL - 1);
    expect((await getCommentById(target))?.dead).toBe(false);
    await addFlags(target, 1);
    expect((await getCommentById(target))?.dead).toBe(true);
    await addVouches(target, FLAG_KILL - 1);
    expect((await getCommentById(target))?.dead).toBe(true);
    await addVouches(target, 1);
    expect((await getCommentById(target))?.dead).toBe(false);
  });

  it("need more flags when the comment has weighted support", async () => {
    const author = await makeUser();
    const target = await plainComment(author, await makeStartup(), "well liked");
    for (let i = 0; i < 8; i += 1) await vote(await makeUser({ trusted: true }), target);
    expect((await getCommentById(target))?.score).toBeCloseTo(8);
    await addFlags(target, 3);
    expect((await getCommentById(target))?.dead).toBe(false);
    await addFlags(target, 1);
    expect((await getCommentById(target))?.dead).toBe(true);
  });

  it("do not count provisional support toward the threshold", async () => {
    const author = await makeUser();
    const target = await plainComment(author, await makeStartup(), "sock supported");
    for (let i = 0; i < 20; i += 1) await vote(await makeUser(), target);
    expect((await getCommentById(target))?.points).toBe(20);
    await addFlags(target, FLAG_KILL);
    expect((await getCommentById(target))?.dead).toBe(true);
  });

  it("ignore flags and vouches from muted accounts", async () => {
    const author = await makeUser();
    const target = await plainComment(author, await makeStartup(), "target");
    await addFlags(target, FLAG_KILL - 1);
    await addFlags(target, 1, { muted: true });
    expect((await getCommentById(target))?.dead).toBe(false);
    await addFlags(target, 1);
    expect((await getCommentById(target))?.dead).toBe(true);
    const mutedVoucher = await makeUser({ muted: true });
    for (let i = 0; i < FLAG_KILL; i += 1) {
      await run("INSERT INTO comment_vouches (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
        target,
        i === 0 ? mutedVoucher.id : (await makeUser()).id,
        Date.now(),
      ]);
    }
    expect((await getCommentById(target))?.dead).toBe(true);
  });

  it("mark everything by a muted author dead", async () => {
    const muted = await makeUser({ muted: true });
    const target = await plainComment(muted, await makeStartup(), "muted says");
    expect((await getCommentById(target))?.dead).toBe(true);
  });
});

describe("vouching", () => {
  it("needs karma and a dead comment, then toggles", async () => {
    const mutedAuthor = await makeUser({ muted: true });
    const dead = await plainComment(mutedAuthor, await makeStartup(), "dead one");
    const alive = await plainComment(await makeUser(), await makeStartup(), "alive one");
    const voucher = await makeUser();
    await giveKarma(voucher, VOUCH_KARMA - 1);
    await vouch(voucher, dead);
    expect(await count("comment_vouches")).toBe(0);

    await vote(await makeUser({ trusted: true }), await plainComment(voucher, await makeStartup(), "bait"));
    expect(await getKarma(voucher.id)).toBe(VOUCH_KARMA);
    await vouch(voucher, alive);
    expect(await count("comment_vouches")).toBe(0);
    await vouch(voucher, dead);
    expect(await count("comment_vouches")).toBe(1);
    expect((await getCommentById(dead, voucher.id))?.vouched).toBe(true);
    clock.freeze();
    clock.advance(2001);
    await vouch(voucher, dead);
    expect(await count("comment_vouches")).toBe(0);
  });
});

describe("who sees dead comments", () => {
  it("is the author, showdead viewers, and the admin", () => {
    expect(seesDead(null)).toBe(false);
    expect(seesDead({ username: "alice", showDead: false })).toBe(false);
    expect(seesDead({ username: "alice", showDead: true })).toBe(true);
    expect(seesDead({ username: "admin", showDead: false })).toBe(true);
    expect(isAdmin({ username: "Admin" })).toBe(true);
    expect(isAdmin({ username: "administrator" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
