import { describe, expect, it } from "vitest";
import { rebalanceAction } from "@/app/actions/book";
import type { BookChange, Held } from "@/lib/book";
import { countDeployed, getActivePosition, listEventsForStartup, movesLeft } from "@/lib/db/book";
import { MOVES_PER_DAY } from "@/lib/market";
import type { Direction, Startup, User } from "@/lib/types";
import { count } from "./harness/db";
import { actAs, clock, form, makeStartup, makeUser, openPosition, outcome, type Outcome } from "./harness/factories";
import { cacheCalls } from "./harness/request";

function held(direction: Direction, conviction: number): Held {
  return { direction, conviction };
}

function open(startup: Startup, direction: Direction, conviction: number, note = ""): BookChange {
  return { startupId: startup.id, from: null, direction, conviction, note, close: false };
}

function set(startup: Startup, from: Held, direction: Direction, conviction: number, note = "Holding"): BookChange {
  return { startupId: startup.id, from, direction, conviction, note, close: false };
}

function close(startup: Startup, from: Held): BookChange {
  return { startupId: startup.id, from, direction: from.direction, conviction: 0, note: "", close: true };
}

async function commit(user: User, changes: unknown): Promise<Outcome> {
  await actAs(user);
  const raw = typeof changes === "string" ? changes : JSON.stringify(changes);
  return outcome(rebalanceAction(null, form({ changes: raw })));
}

// Opens through the real path with a note the headline pass leaves alone.
async function hold(user: User, startup: Startup, direction: Direction, conviction: number): Promise<void> {
  const result = await openPosition(user, startup, { direction, conviction, note: "Holding" });
  if (result.state?.error) throw new Error(result.state.error);
  clock.advance(5_001);
}

describe("committing a rebalance", () => {
  it("lands opens, cuts, flips, and closes together under one rate-log entry", async () => {
    clock.freeze();
    const user = await makeUser();
    const [a, b, c, d] = await Promise.all([makeStartup(), makeStartup(), makeStartup(), makeStartup()]);
    await hold(user, a, "long", 30);
    await hold(user, b, "long", 20);
    await hold(user, c, "short", 10);
    const result = await commit(user, [
      open(d, "long", 25, "A fresh take"),
      set(a, held("long", 30), "long", 10),
      set(b, held("long", 20), "short", 20, "Changed my mind"),
      close(c, held("short", 10)),
    ]);
    expect(result).toEqual({ state: null, redirect: null });

    expect((await getActivePosition(a.id, user.id))?.conviction).toBe(10);
    const flipped = await getActivePosition(b.id, user.id);
    expect(flipped?.direction).toBe("short");
    expect(flipped?.note).toBe("Changed my mind");
    expect(await getActivePosition(c.id, user.id)).toBeNull();
    const opened = await getActivePosition(d.id, user.id);
    expect(opened?.conviction).toBe(25);
    expect(opened?.note).toBe("A fresh take");
    expect(await countDeployed(user.id)).toBe(55);
    // Three opens before the commit, then one open and one flip inside it.
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 5);
    expect(await count("rate_log", "kind = 'book' AND user_id = ?", [user.id])).toBe(4);
    expect((await listEventsForStartup(a.id)).map((e) => e.kind)).toEqual(["decrease", "open"]);
    expect((await listEventsForStartup(b.id)).map((e) => e.kind)).toEqual(["flip", "open"]);
    expect((await listEventsForStartup(c.id)).map((e) => e.kind)).toEqual(["close", "open"]);
    expect(await count("comments", "user_id = ? AND startup_id = ?", [user.id, d.id])).toBe(1);
    expect(cacheCalls.updateTag).toEqual(
      expect.arrayContaining(["world", "front", "leaders", "session", `startup:${a.id}`, `startup:${d.id}`]),
    );
  });

  it("moves Conviction between positions in one step where single changes would trip the cap", async () => {
    clock.freeze();
    const user = await makeUser();
    const [a, b] = await Promise.all([makeStartup(), makeStartup()]);
    await hold(user, a, "long", 80);
    expect((await openPosition(user, b, { conviction: 80 })).state?.error).toMatch(/Only 20 Conviction left/);
    clock.advance(5_001);
    const result = await commit(user, [open(b, "long", 80), set(a, held("long", 80), "long", 20)]);
    expect(result.state).toBeNull();
    expect((await getActivePosition(a.id, user.id))?.conviction).toBe(20);
    expect((await getActivePosition(b.id, user.id))?.conviction).toBe(80);
    expect(await countDeployed(user.id)).toBe(100);
  });

  it("writes nothing when the batch would overflow the cap", async () => {
    clock.freeze();
    const user = await makeUser();
    const [a, b, c] = await Promise.all([makeStartup(), makeStartup(), makeStartup()]);
    await hold(user, a, "long", 60);
    const result = await commit(user, [open(b, "long", 30), open(c, "short", 20)]);
    expect(result.state?.error).toBe("That adds up to 110 Conviction. Your Book holds 100.");
    expect(await count("positions", "user_id = ?", [user.id])).toBe(1);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
    expect(await count("rate_log", "kind = 'book' AND user_id = ?", [user.id])).toBe(1);
  });

  it("writes nothing when the batch needs more moves than are left", async () => {
    clock.set(Date.parse("2026-09-02T12:00:00.000Z"));
    const user = await makeUser();
    const first = await makeStartup();
    await hold(user, first, "long", 5);
    for (let i = 1; i < MOVES_PER_DAY - 1; i += 1) await hold(user, await makeStartup(), "long", 1);
    expect(await movesLeft(user.id)).toBe(1);
    const [x, y] = await Promise.all([makeStartup(), makeStartup()]);
    expect((await commit(user, [open(x, "long", 1), open(y, "long", 1)])).state?.error).toBe(
      "Needs 2 moves. 1 left today.",
    );
    expect(await count("positions", "user_id = ?", [user.id])).toBe(MOVES_PER_DAY - 1);
    // Cuts and closes stay free, so they ride along with the last move.
    const result = await commit(user, [open(x, "long", 1), set(first, held("long", 5), "long", 2)]);
    expect(result.state).toBeNull();
    expect(await movesLeft(user.id)).toBe(0);
    expect((await getActivePosition(first.id, user.id))?.conviction).toBe(2);
  });

  it("refuses a page whose view of the Book is older than the database", async () => {
    clock.freeze();
    const user = await makeUser();
    const a = await makeStartup();
    await hold(user, a, "long", 30);
    const stale = await commit(user, [set(a, held("long", 20), "long", 10)]);
    expect(stale.state?.error).toMatch(/changed since this page loaded/);
    expect((await getActivePosition(a.id, user.id))?.conviction).toBe(30);
    // A failed commit spends no rate-log entry, so the retry is not "too fast".
    const unheld = await commit(user, [open(a, "long", 5)]);
    expect(unheld.state?.error).toMatch(/changed since this page loaded/);
    expect(await count("positions", "user_id = ?", [user.id])).toBe(1);
  });

  it("skips changes that change nothing and refuses a commit made only of them", async () => {
    clock.freeze();
    const user = await makeUser();
    const a = await makeStartup();
    await hold(user, a, "long", 30);
    // The headline pass drops the trailing period, so this note is the one on file.
    const noop = set(a, held("long", 30), "long", 30, "Holding.");
    expect((await commit(user, [noop])).state?.error).toBe("Nothing to change.");
    const b = await makeStartup();
    expect((await commit(user, [noop, open(b, "short", 5)])).state).toBeNull();
    expect(await count("positions", "user_id = ?", [user.id])).toBe(2);
    expect((await listEventsForStartup(a.id)).map((e) => e.kind)).toEqual(["open"]);
  });

  it("rejects malformed commits before touching the Book", async () => {
    const user = await makeUser();
    const a = await makeStartup();
    expect((await commit(user, "not json")).state?.error).toBe("Could not read those changes.");
    expect((await commit(user, [])).state?.error).toBe("Nothing to change.");
    expect((await commit(user, [open(a, "long", 5), open(a, "short", 5)])).state?.error).toBe(
      "One change per company.",
    );
    expect((await commit(user, [{ ...open(a, "long", 5), conviction: 101 }])).state?.error).toBe(
      "Could not read those changes.",
    );
    expect((await commit(user, [{ ...open(a, "long", 5), close: true }])).state?.error).toBe(
      "Could not read those changes.",
    );
    expect((await commit(user, [open(a, "long", 5, "x".repeat(501))])).state?.error).toMatch(/500 characters/);
    expect((await commit(user, [open({ ...a, id: "missing" }, "long", 5)])).state?.error).toBe("Company not found.");
    expect(await count("positions")).toBe(0);
    expect(await count("rate_log", "kind = 'book'")).toBe(0);
  });

  it("sends anonymous users to login", async () => {
    await actAs(null);
    const result = await outcome(rebalanceAction(null, form({ changes: "[]" })));
    expect(result.redirect).toBe("/login");
  });
});
