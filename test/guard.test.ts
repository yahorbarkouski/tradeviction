import { describe, expect, it } from "vitest";
import { GuardError, assertWrite, clientIp, guarded } from "@/lib/guard";
import { DAY_MS } from "@/lib/time";
import { count, run } from "./harness/db";
import { clock, makeStartup, makeUser } from "./harness/factories";
import { request } from "./harness/request";

const HOUR = 3_600_000;

describe("clientIp", () => {
  it("takes the first forwarded address, trimmed and capped at 64 characters", async () => {
    request.ip = "  1.2.3.4 , 5.6.7.8";
    expect(await clientIp()).toBe("1.2.3.4");
    request.ip = "x".repeat(100);
    expect((await clientIp()).length).toBe(64);
  });
});

describe("guarded", () => {
  it("rolls the write back when the limit trips", async () => {
    clock.freeze();
    const user = await makeUser();
    await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'vote', ?)", [
      user.id,
      "1.1.1.1",
      Date.now(),
    ]);
    await expect(guarded("vote", user, () => makeStartup("Ghost"))).rejects.toBeInstanceOf(GuardError);
    expect(await count("startups", "name = 'Ghost'")).toBe(0);
    expect(await count("rate_log", "kind = 'vote'")).toBe(1);
  });

  it("logs the write and returns its result when allowed", async () => {
    const user = await makeUser();
    const startup = await guarded("book", user, () => makeStartup("Real"));
    expect(startup.name).toBe("Real");
    expect(await count("rate_log", "kind = 'book' AND user_id = ?", [user.id])).toBe(1);
  });

  it("lets simultaneous writes by one actor through one at a time", async () => {
    clock.freeze();
    const user = await makeUser();
    const results = await Promise.allSettled([
      guarded("vote", user, () => makeStartup("Parallel One")),
      guarded("vote", user, () => makeStartup("Parallel Two")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(GuardError);
    expect(await count("startups")).toBe(1);
    expect(await count("rate_log", "kind = 'vote'")).toBe(1);
  });

  it("does not serialize different actors", async () => {
    clock.freeze();
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const results = await Promise.all([
      guarded("vote", a, () => makeStartup("Actor A")),
      guarded("vote", b, () => makeStartup("Actor B")),
    ]);
    expect(results.map((s) => s.name).sort()).toEqual(["Actor A", "Actor B"]);
  });

  it("attributes the log to whoever actorOf names", async () => {
    const user = await makeUser();
    await guarded("register", null, async () => user, (created) => created.id);
    expect(await count("rate_log", "kind = 'register' AND user_id = ?", [user.id])).toBe(1);
  });
});

describe("assertWrite", () => {
  it("requires a login for user-scoped kinds", async () => {
    await expect(assertWrite("vote", null)).rejects.toThrow(/Login required/);
    await expect(assertWrite("book", null)).rejects.toThrow(/Login required/);
  });

  it("has no minimum account age for votes or flags", async () => {
    const user = await makeUser();
    await expect(assertWrite("vote", user)).resolves.toBeTypeOf("string");
    await expect(assertWrite("flag", user)).resolves.toBeTypeOf("string");
    await expect(assertWrite("book", user)).resolves.toBeTypeOf("string");
  });

  it.each([
    [0, 10 * 60_000],
    [3 * DAY_MS, 3 * 60_000],
    [8 * DAY_MS, 30_000],
  ])("spaces comments from an account aged %d ms by %d ms", async (age, gap) => {
    clock.freeze();
    const user = await makeUser({ createdAt: Date.now() - age });
    await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'comment', ?)", [
      user.id,
      "1.1.1.1",
      Date.now(),
    ]);
    clock.advance(gap - 1);
    await expect(assertWrite("comment", user)).rejects.toThrow(/too fast/);
    clock.advance(1);
    await expect(assertWrite("comment", user)).resolves.toBeTypeOf("string");
  });

  it.each([
    [0, 6 * HOUR],
    [3 * DAY_MS, 2 * HOUR],
    [8 * DAY_MS, 30 * 60_000],
  ])("spaces submissions from an account aged %d ms by %d ms", async (age, gap) => {
    clock.freeze();
    const user = await makeUser({ createdAt: Date.now() - age });
    await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'submit', ?)", [
      user.id,
      "1.1.1.1",
      Date.now(),
    ]);
    clock.advance(gap - 1);
    await expect(assertWrite("submit", user)).rejects.toThrow(/too fast/);
    clock.advance(1);
    await expect(assertWrite("submit", user)).resolves.toBeTypeOf("string");
  });

  it("caps votes at forty an hour and flags at thirty", async () => {
    clock.freeze();
    const user = await makeUser();
    for (let i = 0; i < 40; i += 1) {
      await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'vote', ?)", [
        user.id,
        "1.1.1.1",
        Date.now() - HOUR + 1000 + i,
      ]);
    }
    await expect(assertWrite("vote", user)).rejects.toThrow(/Vote limit/);
    for (let i = 0; i < 30; i += 1) {
      await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'flag', ?)", [
        user.id,
        "1.1.1.1",
        Date.now() - HOUR + 1000 + i,
      ]);
    }
    await expect(assertWrite("flag", user)).rejects.toThrow(/Too many flags/);
    clock.advance(HOUR);
    await expect(assertWrite("vote", user)).resolves.toBeTypeOf("string");
    await expect(assertWrite("flag", user)).resolves.toBeTypeOf("string");
  });
});
