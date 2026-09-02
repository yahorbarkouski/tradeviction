import { describe, expect, it } from "vitest";
import { logoutAction } from "@/app/actions/auth";
import { showDeadAction } from "@/app/actions/users";
import { cachedWorldData } from "@/lib/engine";
import { cachedEvents } from "@/lib/db/book";
import { cachedFrontPage, cachedThread } from "@/lib/db/comments";
import { cachedFeed } from "@/lib/db/markets";
import { cachedLeaders } from "@/lib/db/scores";
import { cachedStartupBySlug } from "@/lib/db/startups";
import { loadThesis } from "@/lib/share";
import { TAG, startupTag } from "@/lib/tags";
import { ownsComment, showsDead } from "@/lib/marks";
import { getViewerMarks, getViewerStats } from "@/lib/viewer";
import { run } from "./harness/db";
import {
  actAs,
  form,
  login,
  makeStartup,
  makeUser,
  openPosition,
  outcome,
  plainComment,
  register,
  reply,
  submit,
  thesis,
  vote,
} from "./harness/factories";
import { cacheCalls } from "./harness/request";

function tagged(): string[] {
  return [...new Set(cacheCalls.cacheTag)];
}

function expired(): string[] {
  return [...new Set(cacheCalls.updateTag)];
}

async function tagsOf(read: () => Promise<unknown>): Promise<string[]> {
  cacheCalls.cacheTag = [];
  await read();
  return tagged();
}

describe("shared readers", () => {
  it("tag every entry with what can expire it", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    await thesis(alice, startup);

    expect(await tagsOf(() => cachedWorldData())).toEqual([TAG.world]);
    expect(await tagsOf(() => cachedFrontPage(1))).toEqual(expect.arrayContaining([TAG.front, TAG.threads]));
    expect(await tagsOf(() => cachedThread(startup.id))).toEqual(
      expect.arrayContaining([TAG.threads, startupTag(startup.id)]),
    );
    expect(await tagsOf(() => cachedEvents(startup.id))).toEqual([startupTag(startup.id)]);
    expect(await tagsOf(() => cachedStartupBySlug(startup.slug))).toEqual(
      expect.arrayContaining([TAG.startups, startupTag(startup.id)]),
    );
    expect(await tagsOf(() => cachedStartupBySlug("no-such-company"))).toEqual([TAG.startups]);
    expect(await tagsOf(() => cachedLeaders())).toEqual(expect.arrayContaining([TAG.world, TAG.leaders]));
    expect(await tagsOf(() => cachedFeed("hot", 1))).toEqual(expect.arrayContaining([TAG.world, TAG.startups]));
  });

  it("serve one list to everyone, with dead rows kept and marked", async () => {
    const startup = await makeStartup();
    const muted = await makeUser({ muted: true });
    await plainComment(muted, startup, "dead root");
    const alive = await makeUser();
    await plainComment(alive, startup, "alive root");

    const page = await cachedFrontPage(1);
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.text, item.dead]).sort()).toEqual([
      ["alive root", false],
      ["dead root", true],
    ]);
    expect(page.items.every((item) => !item.voted && !item.own && !item.flagged)).toBe(true);

    const thread = await cachedThread(startup.id);
    expect(thread.map((node) => [node.text, node.dead]).sort()).toEqual([
      ["alive root", false],
      ["dead root", true],
    ]);
  });

  it("find a dead comment by permalink through the shared thread", async () => {
    const startup = await makeStartup();
    const muted = await makeUser({ muted: true });
    const id = await plainComment(muted, startup, "dead root");
    const loaded = await loadThesis(startup.slug, id);
    expect(loaded?.comment.id).toBe(id);
    expect(loaded?.comment.dead).toBe(true);
    expect(loaded?.thread.map((node) => node.id)).toEqual([id]);
  });
});

describe("viewer marks", () => {
  it("are null for anonymous viewers", async () => {
    await actAs(null);
    expect(await getViewerMarks()).toBeNull();
  });

  it("list what the viewer voted, flagged, and vouched for, plus their standing", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const id = await thesis(alice, startup);
    const other = await plainComment(alice, startup, "another root");
    const bob = await makeUser();
    expect((await vote(bob, id)).state).toBeNull();
    await run("INSERT INTO comment_flags (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
      other,
      bob.id,
      Date.now(),
    ]);
    await run("INSERT INTO comment_vouches (comment_id, user_id, created_at) VALUES (?, ?, ?)", [
      other,
      bob.id,
      Date.now(),
    ]);

    await actAs(bob);
    const marks = await getViewerMarks();
    expect(marks).toMatchObject({
      id: bob.id,
      username: bob.username,
      admin: false,
      showDead: false,
      karma: 0,
      voted: [id],
      flagged: [other],
      vouched: [other],
    });
    expect(ownsComment(marks, bob.id)).toBe(true);
    expect(ownsComment(marks, alice.id)).toBe(false);
    expect(ownsComment(null, bob.id)).toBe(false);
  });

  it("decide who sees a dead comment", async () => {
    const author = await makeUser();
    await actAs(author);
    const own = await getViewerMarks();
    expect(showsDead(own, author.id)).toBe(true);
    expect(showsDead(own, "someone-else")).toBe(false);
    expect(showsDead(null, author.id)).toBe(false);
    await actAs(author);
    await showDeadAction(form({ on: "1" }));
    const opted = await getViewerMarks();
    expect(opted?.showDead).toBe(true);
    expect(showsDead(opted, "someone-else")).toBe(true);
  });

  it("report the header numbers for a signed-in viewer", async () => {
    const user = await makeUser();
    await openPosition(user, await makeStartup(), { conviction: 10 });
    const stats = await getViewerStats(user.id);
    expect(stats.karma).toBe(0);
    expect(stats.alpha).toBeLessThanOrEqual(0);
  });
});

describe("what a write expires", () => {
  it("a vote: this thread, the front page, the leaderboard, and the session", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const id = await thesis(alice, startup);
    const bob = await makeUser();
    cacheCalls.updateTag = [];
    expect((await vote(bob, id)).state).toBeNull();
    expect(expired().sort()).toEqual([TAG.front, TAG.leaders, TAG.session, startupTag(startup.id)].sort());
  });

  it("a book change: the world too, and nothing navigates without a next path", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    cacheCalls.updateTag = [];
    const result = await openPosition(user, startup, { conviction: 10 });
    expect(result).toEqual({ redirect: null, state: null });
    expect(expired().sort()).toEqual([TAG.world, TAG.front, TAG.leaders, TAG.session, startupTag(startup.id)].sort());
  });

  it("a reply: the world, this thread, the front page, and the session", async () => {
    const alice = await makeUser();
    const startup = await makeStartup();
    const root = await thesis(alice, startup);
    const bob = await makeUser();
    cacheCalls.updateTag = [];
    expect(await reply(bob, root, "A reply worth caching.")).toEqual({ redirect: null, state: null });
    expect(expired().sort()).toEqual([TAG.world, TAG.front, TAG.session, startupTag(startup.id)].sort());
  });

  it("a submit: the startup rows and the world", async () => {
    const user = await makeUser();
    cacheCalls.updateTag = [];
    const result = await submit(user, {
      url: "https://cached-startup.example",
      name: "Cached Startup",
    });
    expect(result.redirect).toMatch(/^\/s\//);
    expect(expired().sort()).toEqual([TAG.startups, TAG.world].sort());
  });

  it("signing in, out, up, and toggling showdead: the session", async () => {
    cacheCalls.updateTag = [];
    const user = await register("cachedviewer");
    expect(expired().sort()).toEqual([TAG.session, TAG.world].sort());

    cacheCalls.updateTag = [];
    expect((await login("cachedviewer")).redirect).toBe("/");
    expect(expired()).toEqual([TAG.session]);

    cacheCalls.updateTag = [];
    await actAs(user);
    expect((await outcome(logoutAction())).redirect).toBe("/");
    expect(expired()).toEqual([TAG.session]);

    cacheCalls.updateTag = [];
    await actAs(user);
    await showDeadAction(form({ on: "1" }));
    expect(expired()).toEqual([TAG.session]);
  });

  it("a refused write: nothing", async () => {
    const alice = await makeUser();
    const id = await thesis(alice, await makeStartup());
    cacheCalls.updateTag = [];
    expect((await vote(alice, id)).state?.error).toMatch(/own comment/);
    expect(expired()).toEqual([]);
  });
});
