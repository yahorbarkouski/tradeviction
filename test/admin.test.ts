import { describe, expect, it } from "vitest";
import {
  adminDeleteCommentAction,
  adminDeleteStartupAction,
  adminDeleteUserAction,
  adminMuteAction,
  adminTrustAction,
  adminUpdateCommentAction,
  adminUpdateStartupAction,
} from "@/app/actions";
import {
  getCommentById,
  getPlayerStats,
  getStartupById,
  getUserByUsername,
  listIpSiblings,
  listThread,
} from "@/lib/db/queries";
import { PROVISIONAL_WEIGHT } from "@/lib/market";
import type { User } from "@/lib/types";
import { count, getRow, run } from "./harness/db";
import {
  actAs,
  clock,
  form,
  makeStartup,
  makeUser,
  openPosition,
  outcome,
  plainComment,
  reply,
  thesis,
  vote,
} from "./harness/factories";

async function admin(): Promise<User> {
  return makeUser({ username: "admin" });
}

describe("admin gate", () => {
  it("turns everyone but the admin account away", async () => {
    const target = await makeUser({ username: "target" });
    const nobody = await makeUser();
    await actAs(nobody);
    expect((await outcome(adminMuteAction(form({ username: "target", on: "1" })))).redirect).toBe("/");
    expect((await outcome(adminTrustAction(form({ username: "target", on: "1" })))).redirect).toBe("/");
    expect((await outcome(adminDeleteUserAction(form({ username: "target" })))).redirect).toBe("/");
    await actAs(null);
    expect((await outcome(adminMuteAction(form({ username: "target", on: "1" })))).redirect).toBe("/login");
    const after = await getUserByUsername("target");
    expect(after?.muted).toBe(false);
    expect(after?.trusted).toBe(false);
    expect(after?.id).toBe(target.id);
  });

  it("never mutes, trusts, or deletes the admin account, and bounces unknown names", async () => {
    const root = await admin();
    await actAs(root);
    expect((await outcome(adminMuteAction(form({ username: "admin", on: "1" })))).redirect).toBe("/u/admin");
    expect((await outcome(adminTrustAction(form({ username: "admin", on: "1" })))).redirect).toBe("/u/admin");
    expect((await outcome(adminDeleteUserAction(form({ username: "admin" })))).redirect).toBe("/u/admin");
    expect((await outcome(adminMuteAction(form({ username: "ghost", on: "1" })))).redirect).toBe("/u/ghost");
    const self = await getUserByUsername("admin");
    expect(self?.muted).toBe(false);
    expect(self?.trusted).toBe(false);
  });
});

describe("mute and trust", () => {
  it("mutes and unmutes, and the muted account's votes stop counting", async () => {
    const root = await admin();
    const alice = await makeUser();
    const bob = await makeUser({ username: "bob" });
    const comment = await plainComment(alice, await makeStartup());
    await vote(bob, comment);
    expect((await getCommentById(comment))?.points).toBe(1);

    await actAs(root);
    expect((await outcome(adminMuteAction(form({ username: "bob", on: "1" })))).state).toBeNull();
    expect((await getUserByUsername("bob"))?.muted).toBe(true);
    expect((await getCommentById(comment))?.points).toBe(0);
    expect((await outcome(adminMuteAction(form({ username: "bob", on: "0" })))).state).toBeNull();
    expect((await getUserByUsername("bob"))?.muted).toBe(false);
    expect((await getCommentById(comment))?.points).toBe(1);
  });

  it("trusts and untrusts, which counts the account as established at once", async () => {
    const root = await admin();
    const alice = await makeUser();
    const carol = await makeUser({ username: "carol" });
    const comment = await plainComment(alice, await makeStartup());
    await vote(carol, comment);
    expect((await getCommentById(comment))?.score).toBeCloseTo(PROVISIONAL_WEIGHT);
    expect((await getPlayerStats(carol.id)).established).toBe(false);

    await actAs(root);
    expect((await outcome(adminTrustAction(form({ username: "carol", on: "1" })))).state).toBeNull();
    expect((await getUserByUsername("carol"))?.trusted).toBe(true);
    expect((await getCommentById(comment))?.score).toBeCloseTo(1);
    expect((await getPlayerStats(carol.id)).established).toBe(true);

    expect((await outcome(adminTrustAction(form({ username: "carol", on: "0" })))).state).toBeNull();
    expect((await getUserByUsername("carol"))?.trusted).toBe(false);
    expect((await getCommentById(comment))?.score).toBeCloseTo(PROVISIONAL_WEIGHT);
  });
});

describe("deleting", () => {
  it("removes a user and everything they wrote, reparenting replies to the next living ancestor", async () => {
    clock.freeze();
    const root = await admin();
    const alice = await makeUser({ username: "alice" });
    const bob = await makeUser({ username: "bob" });
    const carol = await makeUser({ username: "carol" });
    const dave = await makeUser({ username: "dave" });
    const startup = await makeStartup();
    const top = await thesis(alice, startup);
    await reply(bob, top, "bob replies to alice");
    const r1 = (await listThread(startup.id, null))[0]?.kids[0]?.id ?? "";
    await reply(carol, r1, "carol replies to bob");
    const r2 = (await listThread(startup.id, null))[0]?.kids[0]?.kids[0]?.id ?? "";
    await reply(dave, r2, "dave replies to carol");
    await vote(carol, top);
    await vote(bob, top);
    clock.advance(5001);
    await openPosition(bob, await makeStartup(), { conviction: 5 });

    await actAs(root);
    expect((await outcome(adminDeleteUserAction(form({ username: "bob" })))).redirect).toBe("/");
    expect(await getUserByUsername("bob")).toBeNull();
    expect(await count("comments", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("comment_votes", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("positions", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("lots", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("events", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("moves", "user_id = ?", [bob.id])).toBe(0);
    expect(await count("rate_log", "user_id = ?", [bob.id])).toBe(0);

    const thread = await listThread(startup.id, null);
    expect(thread[0]?.id).toBe(top);
    expect(thread[0]?.kids.map((kid) => kid.text)).toEqual(["carol replies to bob"]);
    expect(thread[0]?.kids[0]?.kids.map((kid) => kid.text)).toEqual(["dave replies to carol"]);
    expect((await getCommentById(top))?.points).toBe(1);

    expect((await outcome(adminDeleteUserAction(form({ username: "alice" })))).redirect).toBe("/");
    const orphaned = await getRow("SELECT parent_id, position_id FROM comments WHERE id = ?", [r2]);
    expect(orphaned?.parent_id).toBeNull();
    expect(await count("comments")).toBe(2);
  });

  it("removes a comment with its whole subtree and their votes", async () => {
    const root = await admin();
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const top = await thesis(alice, startup);
    await reply(bob, top, "a reply");
    const kid = (await listThread(startup.id, null))[0]?.kids[0]?.id ?? "";
    await vote(bob, top);
    const other = await plainComment(bob, startup, "unrelated");

    await actAs(root);
    const result = await outcome(adminDeleteCommentAction(form({ commentId: top, next: `/s/${startup.slug}/c/${top}` })));
    expect(result.redirect).toBe(`/s/${startup.slug}`);
    expect(await getCommentById(top)).toBeNull();
    expect(await getCommentById(kid)).toBeNull();
    expect(await getCommentById(other)).not.toBeNull();
    expect(await count("comment_votes")).toBe(0);
    expect(await count("positions")).toBe(1);
  });

  it("removes a startup with every position, lot, event, and comment on it", async () => {
    const root = await admin();
    const alice = await makeUser();
    const startup = await makeStartup();
    const keep = await makeStartup();
    await thesis(alice, startup);
    await plainComment(await makeUser(), keep, "keep me");
    await actAs(root);
    expect((await outcome(adminDeleteStartupAction(form({ startupId: startup.id })))).redirect).toBe("/");
    expect(await getStartupById(startup.id)).toBeNull();
    expect(await count("positions")).toBe(0);
    expect(await count("lots")).toBe(0);
    expect(await count("events")).toBe(0);
    expect(await count("comments")).toBe(1);
    expect(await getStartupById(keep.id)).not.toBeNull();
  });
});

describe("editing", () => {
  it("rewrites a comment after validating it", async () => {
    const root = await admin();
    const alice = await makeUser();
    const startup = await makeStartup();
    const top = await thesis(alice, startup);
    await actAs(root);
    expect((await outcome(adminUpdateCommentAction(null, form({ commentId: top, text: "x" })))).state?.error).toMatch(
      /2–2000/,
    );
    expect((await outcome(adminUpdateCommentAction(null, form({ commentId: "nope", text: "fine text" })))).state?.error).toBe(
      "Comment not found.",
    );
    const result = await outcome(adminUpdateCommentAction(null, form({ commentId: top, text: "Edited by admin." })));
    expect(result.redirect).toBe(`/s/${startup.slug}/c/${top}`);
    expect((await getCommentById(top))?.text).toBe("Edited by admin.");
  });

  it("rewrites a startup and refuses a domain that is already listed", async () => {
    const root = await admin();
    const startup = await makeStartup("Acme");
    const other = await makeStartup("Other");
    await actAs(root);
    const clash = await outcome(
      adminUpdateStartupAction(null, form({ startupId: startup.id, name: "Acme", description: "A fine company", url: other.url })),
    );
    expect(clash.state?.error).toBe("That domain is already listed.");
    const bad = await outcome(
      adminUpdateStartupAction(null, form({ startupId: startup.id, name: "A", description: "A fine company", url: startup.url })),
    );
    expect(bad.state?.error).toMatch(/Name should be/);
    const ok = await outcome(
      adminUpdateStartupAction(
        null,
        form({ startupId: startup.id, name: "Acme Corp", description: "Now with a longer line", url: "https://acme-corp-new.com/x" }),
      ),
    );
    expect(ok.redirect).toBe(`/s/${startup.slug}`);
    const after = await getStartupById(startup.id);
    expect(after?.name).toBe("Acme Corp");
    expect(after?.description).toBe("Now with a longer line");
    expect(after?.domain).toBe("acme-corp-new.com");
    expect(after?.url).toBe("https://acme-corp-new.com");
    expect(after?.slug).toBe(startup.slug);
  });
});

describe("network siblings", () => {
  it("lists other accounts that acted from the same address", async () => {
    const alice = await makeUser({ username: "alice" });
    const bob = await makeUser({ username: "bob" });
    const carol = await makeUser({ username: "carol" });
    const dave = await makeUser({ username: "dave" });
    const rows: [string, string, string][] = [
      [alice.id, "10.0.0.1", "register"],
      [bob.id, "10.0.0.1", "register"],
      [carol.id, "10.0.0.2", "register"],
      [carol.id, "10.0.0.1", "vote"],
      [dave.id, "0.0.0.0", "register"],
      [alice.id, "0.0.0.0", "vote"],
    ];
    for (const [userId, ip, kind] of rows) {
      await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, ?, ?)", [userId, ip, kind, Date.now()]);
    }
    expect(await listIpSiblings(alice.id)).toEqual(["bob", "carol"]);
    expect(await listIpSiblings(dave.id)).toEqual([]);
    expect(await listIpSiblings((await makeUser()).id)).toEqual([]);
  });
});
