import { describe, expect, it } from "vitest";
import { deleteCommentAction } from "@/app/actions/comments";
import { getActivePosition, listEventsForStartup } from "@/lib/db/book";
import { getCommentById, listThread } from "@/lib/db/comments";
import { count, getRow } from "./harness/db";
import { actAs, form, makeStartup, makeUser, outcome, plainComment, reply, thesis, vote } from "./harness/factories";

async function del(commentId: string, next?: string) {
  const fields: Record<string, string> = { commentId };
  if (next) fields.next = next;
  return outcome(deleteCommentAction(form(fields)));
}

describe("deleting your own comment", () => {
  it("removes a reply with its votes and hands its replies to the next living ancestor", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const carol = await makeUser();
    const startup = await makeStartup();
    const top = await thesis(alice, startup);
    await reply(bob, top, "bob replies");
    const r1 = (await listThread(startup.id, null))[0]?.kids[0]?.id ?? "";
    await reply(carol, r1, "carol replies to bob");
    await vote(carol, r1);

    await actAs(bob);
    expect((await del(r1, `/s/${startup.slug}`)).redirect).toBe(`/s/${startup.slug}`);
    expect(await getCommentById(r1)).toBeNull();
    expect(await count("comment_votes", "comment_id = ?", [r1])).toBe(0);
    const thread = await listThread(startup.id, null);
    expect(thread[0]?.kids.map((kid) => kid.text)).toEqual(["carol replies to bob"]);
  });

  it("removes a take but keeps the position, and wipes the text from the book and the log", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const top = await thesis(alice, startup, "my secret thesis");
    await reply(bob, top, "a reply");

    await actAs(alice);
    expect((await del(top, `/s/${startup.slug}/c/${top}`)).redirect).toBe(`/s/${startup.slug}`);
    expect(await getCommentById(top)).toBeNull();
    const position = await getActivePosition(startup.id, alice.id);
    expect(position?.conviction).toBe(10);
    expect(position?.note).toBe("");
    expect((await listEventsForStartup(startup.id)).map((e) => e.note)).toEqual([null]);
    const thread = await listThread(startup.id, null);
    expect(thread.map((node) => node.text)).toEqual(["a reply"]);
    expect(thread[0]?.parentId).toBeNull();
  });

  it("refuses someone else's comment and sends anonymous users to login", async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const startup = await makeStartup();
    const id = await plainComment(alice, startup, "keep me");

    await actAs(bob);
    expect((await del(id)).redirect).toBe(`/s/${startup.slug}`);
    expect(await getCommentById(id)).not.toBeNull();

    await actAs(null);
    expect((await del(id)).redirect).toBe(`/login?next=${encodeURIComponent(`/s/${startup.slug}`)}`);
    expect(await getRow("SELECT id FROM comments WHERE id = ?", [id])).toBeDefined();
  });
});
