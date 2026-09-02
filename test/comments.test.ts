import { describe, expect, it } from "vitest";
import { replyAction } from "@/app/actions";
import { FRONT_PAGE, getCommentById, listFrontComments, listThread } from "@/lib/db/queries";
import { PROVISIONAL_WEIGHT } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { count, run } from "./harness/db";
import {
  actAs,
  clock,
  form,
  frontPage,
  makeStartup,
  makeUser,
  outcome,
  plainComment,
  reply,
  thesis,
  vote,
} from "./harness/factories";

describe("replies", () => {
  it("adds the reply under its parent and re-renders the page in place", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    const bob = await makeUser();
    const result = await reply(bob, root, "I agree with this.");
    expect(result).toEqual({ redirect: null, state: null });
    const thread = await listThread(startup.id, null);
    expect(thread).toHaveLength(1);
    expect(thread[0]?.kids.map((kid) => kid.text)).toEqual(["I agree with this."]);
    expect(thread[0]?.kids[0]?.parentId).toBe(root);
    expect(await count("rate_log", "kind = 'comment' AND user_id = ?", [bob.id])).toBe(1);
  });

  it("stays on a permalink page as well", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    const bob = await makeUser();
    const dest = `/s/${startup.slug}/c/${root}`;
    expect(await reply(bob, root, "Fair point.", dest)).toEqual({ redirect: null, state: null });
  });

  it("validates the text and the parent", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    const bob = await makeUser();
    expect((await reply(bob, root, "x")).state?.error).toMatch(/2–2000/);
    expect((await reply(bob, root, "x".repeat(2001))).state?.error).toMatch(/2–2000/);
    expect((await reply(bob, "missing", "hello there")).state?.error).toBe("Comment not found.");
    expect(await count("comments")).toBe(1);
  });

  it("spaces replies by account age", async () => {
    clock.freeze();
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);

    const fresh = await makeUser();
    expect((await reply(fresh, root, "first from fresh")).state).toBeNull();
    expect((await reply(fresh, root, "second from fresh")).state?.error).toMatch(/Retry in 10 minutes/);
    clock.advance(10 * 60_000);
    expect((await reply(fresh, root, "second from fresh")).state).toBeNull();

    const mid = await makeUser({ createdAt: Date.now() - 3 * DAY_MS });
    expect((await reply(mid, root, "first from mid")).state).toBeNull();
    expect((await reply(mid, root, "second from mid")).state?.error).toMatch(/Retry in 3 minutes/);

    const old = await makeUser({ createdAt: Date.now() - 8 * DAY_MS });
    expect((await reply(old, root, "first from old")).state).toBeNull();
    expect((await reply(old, root, "second from old")).state?.error).toMatch(/Retry in 30 seconds/);
  });

  it("sends anonymous users to login", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    await actAs(null);
    const result = await outcome(replyAction(null, form({ parentId: root, text: "hello there" })));
    expect(result.redirect).toBe(`/login?next=/s/${startup.slug}`);
  });
});

describe("thread order", () => {
  it("orders roots by weighted score, then raw points, then recency, and kids by time", async () => {
    clock.freeze();
    const alice = await makeUser();
    const startup = await makeStartup();
    const r1 = await plainComment(alice, startup, "r1", Date.now());
    clock.advance(1000);
    const r2 = await plainComment(alice, startup, "r2", Date.now());
    clock.advance(1000);
    const r3 = await plainComment(alice, startup, "r3", Date.now());
    clock.advance(1000);
    const r4 = await plainComment(alice, startup, "r4", Date.now());

    const trusted = await makeUser({ trusted: true });
    await vote(trusted, r1);
    for (let i = 0; i < 2; i += 1) await vote(await makeUser(), r2);
    await vote(await makeUser(), r4);

    const bob = await makeUser();
    const carol = await makeUser();
    await reply(bob, r3, "first kid");
    clock.advance(1000);
    await reply(carol, r3, "second kid");

    const thread = await listThread(startup.id, null);
    expect(thread.map((node) => node.text)).toEqual(["r1", "r2", "r4", "r3"]);
    expect(thread[0]?.score).toBeCloseTo(1);
    expect(thread[1]?.score).toBeCloseTo(2 * PROVISIONAL_WEIGHT);
    expect(thread[1]?.points).toBe(2);
    expect(thread[3]?.kids.map((kid) => kid.text)).toEqual(["first kid", "second kid"]);
  });

  it("breaks equal scores by recency", async () => {
    clock.freeze();
    const alice = await makeUser();
    const startup = await makeStartup();
    const older = await plainComment(alice, startup, "older", Date.now());
    clock.advance(1000);
    const newer = await plainComment(alice, startup, "newer", Date.now());
    await vote(await makeUser(), older);
    await vote(await makeUser(), newer);
    expect((await listThread(startup.id, null)).map((node) => node.text)).toEqual(["newer", "older"]);
  });

  it("hides dead comments from others but not from the author or showdead viewers", async () => {
    const startup = await makeStartup();
    const muted = await makeUser({ muted: true });
    await plainComment(muted, startup, "dead one");
    const alive = await makeUser();
    await plainComment(alive, startup, "alive one");
    const viewer = await makeUser();

    expect((await listThread(startup.id, viewer.id)).map((node) => node.text)).toEqual(["alive one"]);
    const own = await listThread(startup.id, muted.id);
    expect(own.map((node) => node.text).sort()).toEqual(["alive one", "dead one"]);
    expect(own.find((node) => node.text === "dead one")?.dead).toBe(true);
    expect((await listThread(startup.id, viewer.id, true)).map((node) => node.text).sort()).toEqual([
      "alive one",
      "dead one",
    ]);
  });
});

describe("front page", () => {
  it("lists only root comments, with raw points and weighted scores", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup, "A root thesis for the front page.");
    const bob = await makeUser();
    await reply(bob, root, "A reply that must not show on the front page.");
    const trusted = await makeUser({ trusted: true });
    await vote(trusted, root);
    await vote(bob, root);

    const page = await frontPage(bob);
    expect(page.total).toBe(1);
    expect(page.texts).toEqual(["A root thesis for the front page."]);
    expect(page.items[0]?.points).toBe(2);
    expect(page.items[0]?.score).toBeCloseTo(1 + PROVISIONAL_WEIGHT);
    expect(page.items[0]?.replies).toBe(1);
    expect(page.items[0]?.voted).toBe(true);
    expect(page.items[0]?.startupSlug).toBe(startup.slug);
    expect(page.items[0]?.position?.conviction).toBe(10);
  });

  it("ranks by decayed score so fresh support beats stale support", async () => {
    clock.set(Date.parse("2026-09-01T00:00:00.000Z"));
    const alice = await makeUser();
    const s1 = await makeStartup();
    const s2 = await makeStartup();
    const old = await plainComment(alice, s1, "old", Date.now());
    for (let i = 0; i < 2; i += 1) await vote(await makeUser({ trusted: true }), old);

    clock.advance(3 * DAY_MS);
    const fresh = await plainComment(alice, s2, "fresh", Date.now());
    await vote(await makeUser({ trusted: true }), fresh);
    expect((await frontPage()).texts).toEqual(["fresh", "old"]);

    for (let i = 0; i < 2; i += 1) await vote(await makeUser({ trusted: true }), old);
    expect((await frontPage()).texts).toEqual(["old", "fresh"]);
  });

  it("breaks ties by the author's standing, then recency", async () => {
    clock.freeze();
    const startup = await makeStartup();
    const trustedAuthor = await makeUser({ trusted: true });
    const freshAuthor = await makeUser();
    await plainComment(trustedAuthor, startup, "by trusted", Date.now());
    clock.advance(1000);
    await plainComment(freshAuthor, startup, "by fresh", Date.now());
    clock.advance(1000);
    await plainComment(freshAuthor, startup, "by fresh later", Date.now());
    expect((await frontPage()).texts).toEqual(["by trusted", "by fresh later", "by fresh"]);
  });

  it("paginates forty per page and reports the total", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    for (let i = 0; i < FRONT_PAGE + 1; i += 1) await plainComment(alice, startup, `root ${i}`);
    const first = await listFrontComments(null, 1);
    expect(first.items).toHaveLength(FRONT_PAGE);
    expect(first.total).toBe(FRONT_PAGE + 1);
    const second = await listFrontComments(null, 2);
    expect(second.items).toHaveLength(1);
  });

  it("hides dead roots from others and counts only what the viewer can see", async () => {
    const startup = await makeStartup();
    const muted = await makeUser({ muted: true });
    await plainComment(muted, startup, "dead root");
    const alive = await makeUser();
    await plainComment(alive, startup, "alive root");
    const viewer = await makeUser();
    expect((await frontPage(viewer)).total).toBe(1);
    expect((await frontPage(muted)).total).toBe(2);
    const showDead = { ...viewer, showDead: true };
    expect((await frontPage(showDead)).total).toBe(2);
  });

  it("reports the viewer's own flag, vouch, and vote state", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    const viewer = await makeUser();
    await run("INSERT INTO comment_flags (comment_id, user_id, created_at) VALUES (?, ?, ?)", [root, viewer.id, Date.now()]);
    await run("INSERT INTO comment_vouches (comment_id, user_id, created_at) VALUES (?, ?, ?)", [root, viewer.id, Date.now()]);
    await vote(viewer, root);
    const seen = await getCommentById(root, viewer.id);
    expect(seen?.flagged).toBe(true);
    expect(seen?.vouched).toBe(true);
    expect(seen?.own).toBe(false);
    expect((await getCommentById(root, alice.id))?.own).toBe(true);
    const listed = (await listFrontComments(viewer.id)).items[0];
    expect(listed?.voted).toBe(true);
    expect(listed?.flagged).toBe(true);
  });
});
