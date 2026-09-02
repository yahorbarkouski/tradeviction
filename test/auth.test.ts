import { describe, expect, it } from "vitest";
import { logoutAction, registerAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { DAY_MS } from "@/lib/time";
import { count, getRow, run } from "./harness/db";
import {
  PASSWORD,
  actAs,
  clock,
  expectRedirect,
  form,
  login,
  outcome,
  register,
  registerResult,
} from "./harness/factories";
import { request } from "./harness/request";

describe("register", () => {
  it("signs the new account in and logs the signup under its id", async () => {
    const user = await register("alice");
    expect(user.username).toBe("alice");
    expect(user.trusted).toBe(false);
    expect(user.muted).toBe(false);
    expect(request.cookies.has("los_session")).toBe(true);
    expect(await count("users")).toBe(1);
    const log = await getRow(
      "SELECT u.username FROM rate_log r JOIN users u ON u.id = r.user_id WHERE r.kind = 'register'",
    );
    expect(log?.username).toBe("alice");
  });

  it("honors a same-origin next path and ignores protocol-relative ones", async () => {
    expect((await registerResult({ username: "one", password: PASSWORD, next: "/s/openai" })).redirect).toBe(
      "/s/openai",
    );
    expect((await registerResult({ username: "two", password: PASSWORD, next: "//evil.example" })).redirect).toBe("/");
    expect(
      (await registerResult({ username: "three", password: PASSWORD, next: "https://evil.example" })).redirect,
    ).toBe("/");
  });

  it.each(["1abc", "a", "a".repeat(21), "bad-name", "sp ace", "", "émile"])("rejects username %j", async (username) => {
    const result = await registerResult({ username, password: PASSWORD });
    expect(result.state?.error).toMatch(/Username must/);
    expect(await count("users")).toBe(0);
  });

  it("rejects passwords that are too short or too long", async () => {
    expect((await registerResult({ username: "alice", password: "short7!" })).state?.error).toMatch(/at least 8/);
    expect((await registerResult({ username: "alice", password: "x".repeat(129) })).state?.error).toMatch(
      /128 characters or fewer/,
    );
    expect(await count("users")).toBe(0);
  });

  it("treats usernames as case-insensitive when checking availability", async () => {
    await register("Alice");
    expect((await registerResult({ username: "alice", password: PASSWORD })).state?.error).toMatch(/taken/);
    expect((await registerResult({ username: "ALICE", password: PASSWORD })).state?.error).toMatch(/taken/);
    expect(await count("users")).toBe(1);
  });

  it("drops honeypot submissions silently", async () => {
    const result = await registerResult({ username: "bot", password: PASSWORD, website: "http://spam.example" });
    expect(result.redirect).toBe("/");
    expect(await count("users")).toBe(0);
  });

  it("spaces signups from one address ten minutes apart and caps them at three a day", async () => {
    clock.freeze();
    const ip = "192.0.2.9";
    expect((await registerResult({ username: "one", password: PASSWORD }, ip)).redirect).toBe("/");
    expect((await registerResult({ username: "two", password: PASSWORD }, ip)).state?.error).toMatch(/too fast/);
    clock.advance(10 * 60_000);
    expect((await registerResult({ username: "two", password: PASSWORD }, ip)).redirect).toBe("/");
    clock.advance(10 * 60_000);
    expect((await registerResult({ username: "three", password: PASSWORD }, ip)).redirect).toBe("/");
    clock.advance(10 * 60_000);
    expect((await registerResult({ username: "four", password: PASSWORD }, ip)).state?.error).toMatch(
      /Too many accounts/,
    );
    expect(await count("users")).toBe(3);
    clock.advance(DAY_MS);
    expect((await registerResult({ username: "four", password: PASSWORD }, ip)).redirect).toBe("/");
  });

  it("lets a different address sign up right away", async () => {
    clock.freeze();
    expect((await registerResult({ username: "one", password: PASSWORD }, "192.0.2.1")).redirect).toBe("/");
    expect((await registerResult({ username: "two", password: PASSWORD }, "192.0.2.2")).redirect).toBe("/");
  });

  it("admits exactly one of two simultaneous signups from one address", async () => {
    clock.freeze();
    request.ip = "192.0.2.10";
    const results = await Promise.all([
      outcome(registerAction(null, form({ username: "race1", password: PASSWORD }))),
      outcome(registerAction(null, form({ username: "race2", password: PASSWORD }))),
    ]);
    expect(results.filter((r) => r.redirect === "/")).toHaveLength(1);
    expect(results.filter((r) => /too fast/.test(r.state?.error ?? ""))).toHaveLength(1);
    expect(await count("users")).toBe(1);
  });
});

describe("login", () => {
  it("rejects wrong passwords, unknown users, and oversized passwords with one message", async () => {
    await register("alice");
    await actAs(null);
    expect((await login("alice", "wrong-password")).state?.error).toBe("Wrong username or password.");
    expect((await login("nobody")).state?.error).toBe("Wrong username or password.");
    expect((await login("alice", "x".repeat(129))).state?.error).toBe("Wrong username or password.");
    expect(await getCurrentUser()).toBeNull();
  });

  it("signs in with the right password and logs the attempt", async () => {
    await register("alice");
    await actAs(null);
    const result = await login("alice");
    expect(result.redirect).toBe("/");
    expect((await getCurrentUser())?.username).toBe("alice");
    expect(await count("rate_log", "kind = 'login'")).toBe(1);
  });

  it("locks an address out after twelve attempts in fifteen minutes", async () => {
    clock.freeze();
    await register("alice");
    request.ip = "192.0.2.20";
    for (let i = 0; i < 12; i += 1) {
      expect((await login("alice", "wrong-password")).state?.error).toBe("Wrong username or password.");
    }
    expect((await login("alice")).state?.error).toMatch(/Too many login attempts/);
    clock.advance(15 * 60_000 + 1);
    expect((await login("alice")).redirect).toBe("/");
  });

  it("drops honeypot submissions silently", async () => {
    await register("alice");
    await actAs(null);
    expect((await login("alice", PASSWORD, { website: "spam" })).redirect).toBe("/");
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("session", () => {
  it("logout clears the cookie", async () => {
    await register("alice");
    await expectRedirect(logoutAction(), "/");
    expect(request.cookies.has("los_session")).toBe(false);
    expect(await getCurrentUser()).toBeNull();
  });

  it("ignores tampered cookies", async () => {
    await register("alice");
    const token = request.cookies.get("los_session") ?? "";
    request.cookies.set("los_session", `${token.slice(0, -2)}xx`);
    expect(await getCurrentUser()).toBeNull();
    request.cookies.set("los_session", "garbage");
    expect(await getCurrentUser()).toBeNull();
  });

  it("expires after thirty days", async () => {
    clock.freeze();
    await register("alice");
    clock.advance(29 * DAY_MS);
    expect((await getCurrentUser())?.username).toBe("alice");
    clock.advance(2 * DAY_MS);
    expect(await getCurrentUser()).toBeNull();
  });

  it("does not resolve a session for a deleted account", async () => {
    const user = await register("alice");
    await run("DELETE FROM rate_log WHERE user_id = ?", [user.id]);
    await run("DELETE FROM users WHERE id = ?", [user.id]);
    expect(await getCurrentUser()).toBeNull();
  });
});
