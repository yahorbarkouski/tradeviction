import { describe, expect, it } from "vitest";
import { showDeadAction } from "@/app/actions/users";
import { getCurrentUser } from "@/lib/auth";
import { actAs, form, frontPage, makeStartup, makeUser, outcome, plainComment } from "./harness/factories";

describe("showdead", () => {
  it("toggles the viewer's setting and reveals dead comments", async () => {
    const user = await makeUser();
    const muted = await makeUser({ muted: true });
    await plainComment(muted, await makeStartup(), "dead root");
    expect((await frontPage(user)).total).toBe(0);

    await actAs(user);
    expect((await outcome(showDeadAction(form({ on: "1" })))).state).toBeNull();
    const on = await getCurrentUser();
    expect(on?.showDead).toBe(true);
    expect((await frontPage(on)).total).toBe(1);

    await outcome(showDeadAction(form({ on: "0" })));
    expect((await getCurrentUser())?.showDead).toBe(false);

    await actAs(null);
    expect((await outcome(showDeadAction(form({ on: "1" })))).redirect).toBe("/login");
  });
});
