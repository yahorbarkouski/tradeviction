import { describe, expect, it } from "vitest";
import { bookAction } from "@/app/actions";
import {
  countDeployed,
  getActivePosition,
  listEventsForStartup,
  listUserBook,
  movesLeft,
} from "@/lib/db/queries";
import { CONVICTION_CAP, MOVES_PER_DAY } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { allRows, count, getRow } from "./harness/db";
import { actAs, clock, form, makeStartup, makeUser, openPosition, outcome } from "./harness/factories";

async function lots(userId: string) {
  return allRows("SELECT conviction, closed_at, realized_alpha FROM lots WHERE user_id = ? ORDER BY opened_at, conviction", [
    userId,
  ]);
}

describe("opening a position", () => {
  it("writes the position, lot, event, thesis comment, move, and rate log", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    const result = await openPosition(user, startup, { direction: "long", conviction: 10, note: "A first thesis." });
    expect(result.state).toBeNull();
    expect(result.redirect).toBe(`/s/${startup.slug}`);

    const position = await getActivePosition(startup.id, user.id);
    expect(position?.direction).toBe("long");
    expect(position?.conviction).toBe(10);
    expect(position?.note).toBe("A first thesis.");
    expect(await lots(user.id)).toEqual([{ conviction: 10, closed_at: null, realized_alpha: null }]);
    expect((await listEventsForStartup(startup.id)).map((e) => e.kind)).toEqual(["open"]);
    const comment = await getRow("SELECT text, position_id, parent_id FROM comments WHERE user_id = ?", [user.id]);
    expect(comment?.text).toBe("A first thesis.");
    expect(comment?.position_id).toBe(position?.id);
    expect(comment?.parent_id).toBeNull();
    expect(await countDeployed(user.id)).toBe(10);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
    expect(await count("rate_log", "kind = 'book' AND user_id = ?", [user.id])).toBe(1);
  });

  it("skips the thesis comment when the note is empty", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    expect((await openPosition(user, startup, { note: "" })).state).toBeNull();
    expect(await count("comments")).toBe(0);
    expect(await count("positions")).toBe(1);
  });

  it("honors a safe next path", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    expect((await openPosition(user, startup, { next: "/u/me" })).redirect).toBe("/u/me");
  });

  it("validates direction, conviction, thesis length, and the startup", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    await actAs(user);
    expect((await outcome(bookAction(null, form({ startupId: "missing" })))).state?.error).toBe("Startup not found.");
    expect(
      (await outcome(bookAction(null, form({ startupId: startup.id, conviction: "5", note: "x" })))).state?.error,
    ).toBe("Pick long or short.");
    expect(
      (await outcome(bookAction(null, form({ startupId: startup.id, direction: "long", conviction: "-1", note: "x" }))))
        .state?.error,
    ).toMatch(/whole number/);
    expect(
      (await outcome(bookAction(null, form({ startupId: startup.id, direction: "long", conviction: "1.5", note: "x" }))))
        .state?.error,
    ).toMatch(/whole number/);
    expect(
      (await outcome(bookAction(null, form({ startupId: startup.id, direction: "long", conviction: "5", note: "x".repeat(501) }))))
        .state?.error,
    ).toMatch(/500 characters/);
    expect(
      (await outcome(bookAction(null, form({ startupId: startup.id, direction: "long", conviction: "101", note: "ok" }))))
        .state?.error,
    ).toMatch(/0 to 100/);
    expect(await count("positions")).toBe(0);
  });

  it("sends anonymous users to login", async () => {
    const startup = await makeStartup();
    await actAs(null);
    const result = await outcome(bookAction(null, form({ startupId: startup.id, direction: "long", conviction: "5" })));
    expect(result.redirect).toBe(`/login?next=/s/${startup.slug}`);
  });

  it("spaces book writes five seconds apart", async () => {
    clock.freeze();
    const user = await makeUser();
    const [a, b] = await Promise.all([makeStartup(), makeStartup()]);
    expect((await openPosition(user, a)).state).toBeNull();
    clock.advance(4999);
    expect((await openPosition(user, b)).state?.error).toMatch(/too fast/);
    clock.advance(1);
    expect((await openPosition(user, b)).state).toBeNull();
  });

  it("keeps the whole Book within the conviction cap, even under simultaneous opens", async () => {
    clock.freeze();
    const user = await makeUser();
    const [a, b, c] = await Promise.all([makeStartup(), makeStartup(), makeStartup()]);
    expect((await openPosition(user, a, { conviction: 60 })).state).toBeNull();
    clock.advance(5001);
    expect((await openPosition(user, b, { conviction: 50 })).state?.error).toBe(
      `Only ${CONVICTION_CAP - 60} Conviction left in your Book.`,
    );
    expect((await openPosition(user, b, { conviction: 40 })).state).toBeNull();
    expect(await countDeployed(user.id)).toBe(100);

    const racer = await makeUser();
    await actAs(racer);
    const results = await Promise.all([
      outcome(bookAction(null, form({ startupId: a.id, direction: "long", conviction: "60", note: "one" }))),
      outcome(bookAction(null, form({ startupId: c.id, direction: "short", conviction: "60", note: "two" }))),
    ]);
    expect(results.filter((r) => r.state === null)).toHaveLength(1);
    expect(await countDeployed(racer.id)).toBe(60);
  });

  it("allows ten moves a day and resets at the UTC day boundary", async () => {
    clock.set(Date.parse("2026-09-02T12:00:00.000Z"));
    const user = await makeUser();
    for (let i = 0; i < MOVES_PER_DAY; i += 1) {
      const startup = await makeStartup();
      expect((await openPosition(user, startup, { conviction: 1 })).state).toBeNull();
      clock.advance(5001);
    }
    expect(await movesLeft(user.id)).toBe(0);
    const extra = await makeStartup();
    expect((await openPosition(user, extra, { conviction: 1 })).state?.error).toMatch(/No commitment moves left today/);
    clock.set(Date.parse("2026-09-03T00:00:01.000Z"));
    expect((await openPosition(user, extra, { conviction: 1 })).state).toBeNull();
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
  });
});

describe("changing a position", () => {
  it("adds a lot and spends a move on increase, frees conviction without a move on decrease", async () => {
    clock.freeze();
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { conviction: 10 });
    clock.advance(5001);
    expect((await openPosition(user, startup, { conviction: 15 })).state).toBeNull();
    expect(await lots(user.id)).toEqual([
      { conviction: 10, closed_at: null, realized_alpha: null },
      { conviction: 5, closed_at: null, realized_alpha: null },
    ]);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 2);
    clock.advance(5001);
    expect((await openPosition(user, startup, { conviction: 12 })).state).toBeNull();
    const after = await lots(user.id);
    expect(after.map((lot) => lot.conviction).sort()).toEqual([10, 2, 3]);
    expect(after.filter((lot) => lot.closed_at !== null)).toHaveLength(1);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 2);
    expect(await countDeployed(user.id)).toBe(12);
    expect((await listEventsForStartup(startup.id)).map((e) => e.kind).sort()).toEqual(["decrease", "increase", "open"]);
  });

  it("records a thesis-only change for free and rejects a no-op", async () => {
    clock.freeze();
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { conviction: 10, note: "First thesis." });
    clock.advance(5001);
    expect((await openPosition(user, startup, { conviction: 10, note: "Second thesis." })).state).toBeNull();
    expect(await count("comments", "user_id = ?", [user.id])).toBe(2);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
    clock.advance(5001);
    expect((await openPosition(user, startup, { conviction: 10, note: "Second thesis." })).state?.error).toBe(
      "Nothing to change.",
    );
  });

  it("flips by closing every lot and opening a fresh one", async () => {
    clock.freeze();
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { direction: "long", conviction: 10 });
    clock.advance(5001);
    expect((await openPosition(user, startup, { direction: "short", conviction: 20 })).state).toBeNull();
    const position = await getActivePosition(startup.id, user.id);
    expect(position?.direction).toBe("short");
    expect(position?.conviction).toBe(20);
    const all = await lots(user.id);
    expect(all.filter((lot) => lot.closed_at === null).map((lot) => lot.conviction)).toEqual([20]);
    expect(all.filter((lot) => lot.closed_at !== null).map((lot) => lot.conviction)).toEqual([10]);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 2);
    expect((await listEventsForStartup(startup.id)).map((e) => e.kind).reverse()).toEqual(["open", "flip"]);
  });

  it("closes the position, frees the conviction, and refuses a second close", async () => {
    clock.freeze();
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { conviction: 30 });
    clock.advance(5001);
    expect((await openPosition(user, startup, { close: true })).state).toBeNull();
    expect(await getActivePosition(startup.id, user.id)).toBeNull();
    expect(await countDeployed(user.id)).toBe(0);
    expect((await lots(user.id)).every((lot) => lot.closed_at !== null)).toBe(true);
    expect((await listEventsForStartup(startup.id)).map((e) => e.kind).reverse()).toEqual(["open", "close"]);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
    clock.advance(5001);
    expect((await openPosition(user, startup, { close: true })).state?.error).toBe("No open position to close.");
    clock.advance(5001);
    expect((await openPosition(user, startup, { conviction: 5 })).state).toBeNull();
    expect(await count("positions", "user_id = ?", [user.id])).toBe(2);
  });

  it("lists the book with entry pulse and zero alpha while the market is forming", async () => {
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { conviction: 10 });
    const book = await listUserBook(user.id);
    expect(book).toHaveLength(1);
    expect(book[0]?.entryPulse).toBe(50);
    expect(book[0]?.pulse).toBe(50);
    expect(book[0]?.liveAlpha).toBeLessThanOrEqual(0);
    expect(book[0]?.position.conviction).toBe(10);
  });

  it("never opens two positions on one startup for the same user", async () => {
    clock.freeze();
    const user = await makeUser();
    const startup = await makeStartup();
    await openPosition(user, startup, { conviction: 10 });
    clock.advance(5001);
    await openPosition(user, startup, { conviction: 20 });
    expect(await count("positions", "user_id = ? AND closed_at IS NULL", [user.id])).toBe(1);
    expect((await getActivePosition(startup.id, user.id))?.conviction).toBe(20);
  });
});

describe("daily move accounting", () => {
  it("counts moves per UTC day", async () => {
    clock.set(Date.parse("2026-09-02T23:59:58.000Z"));
    const user = await makeUser();
    await openPosition(user, await makeStartup(), { conviction: 1 });
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY - 1);
    clock.advance(DAY_MS);
    expect(await movesLeft(user.id)).toBe(MOVES_PER_DAY);
  });
});
