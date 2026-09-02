import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xStartAction, xUnlinkAction, xVerifyAction } from "@/app/actions";
import { accounted, loadWorld } from "@/lib/engine";
import { getCommentById, getUserByUsername, getXChallenge, setXChallenge } from "@/lib/db/queries";
import { X_CODE_PREFIX, X_CODE_TTL_MS, bioHasCode, newXCode, parseXHandle } from "@/lib/x";
import { count, run } from "./harness/db";
import { actAs, clock, form, makeStartup, makeUser, outcome, plainComment, vote } from "./harness/factories";
import { request } from "./harness/request";

type FakeProfile = {
  id?: string;
  userName?: string;
  name?: string;
  description?: string;
  isBlueVerified?: boolean;
  isVerified?: boolean;
  isAutomated?: boolean;
  profilePicture?: string;
  unavailable?: boolean;
};

const CHECKED: FakeProfile = {
  id: "1483833230684037121",
  userName: "yahorbarkouski",
  name: "Yahor Barkouski",
  description: "building search engines https://t.co/Est40B7o36",
  isBlueVerified: true,
  isVerified: false,
  isAutomated: false,
  profilePicture: "https://pbs.twimg.com/profile_images/1/fs6dohpD_normal.jpg",
};

function envelope(data: FakeProfile | null, status = "success", msg = "success"): Response {
  return new Response(JSON.stringify({ status, msg, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubX(answer: (handle: string) => Response | Promise<Response>): string[] {
  const handles: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.twitterapi.io");
      const handle = url.searchParams.get("userName") ?? "";
      handles.push(handle);
      return answer(handle);
    }),
  );
  return handles;
}

beforeEach(() => {
  vi.stubEnv("TWITTERIO_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("handles and codes", () => {
  it.each([
    ["@Yahor_B", "Yahor_B"],
    ["https://x.com/yahor", "yahor"],
    ["https://twitter.com/yahor/status/1", "yahor"],
    ["yahor?ref=1", "yahor"],
    ["  yahor  ", "yahor"],
  ])("reads %s as %s", (raw, handle) => {
    expect(parseXHandle(raw)).toBe(handle);
  });

  it.each(["", "way_too_long_handle_here", "bad-char", "has space", "@"])("rejects %j", (raw) => {
    expect(parseXHandle(raw)).toBeNull();
  });

  it("mints unambiguous codes and finds them in a bio regardless of case", () => {
    const code = newXCode();
    expect(code.startsWith(X_CODE_PREFIX)).toBe(true);
    expect(code).toMatch(/^tv-[a-hj-kmnp-z2-9]{8}$/);
    expect(newXCode()).not.toBe(code);
    expect(bioHasCode(`hello ${code.toUpperCase()} there`, code)).toBe(true);
    expect(bioHasCode("hello there", code)).toBe(false);
  });
});

describe("start", () => {
  it("hands out a code for a checkmarked account and records the lookup", async () => {
    const user = await makeUser();
    const handles = stubX(() => envelope(CHECKED));
    await actAs(user);
    const result = await outcome(xStartAction(null, form({ handle: "@yahorbarkouski" })));
    expect(result.state).toBeNull();
    expect(handles).toEqual(["yahorbarkouski"]);
    const challenge = await getXChallenge(user.id);
    expect(challenge?.handle).toBe("yahorbarkouski");
    expect(challenge?.code).toMatch(/^tv-/);
    expect(challenge?.expiresAt).toBeGreaterThan(Date.now());
    expect(challenge?.expiresAt).toBeLessThanOrEqual(Date.now() + X_CODE_TTL_MS);
    expect(await count("rate_log", "kind = 'verify' AND user_id = ?", [user.id])).toBe(1);
  });

  it("refuses accounts without a checkmark, automated accounts, and missing accounts", async () => {
    const user = await makeUser();
    stubX((handle) => {
      if (handle === "plain") return envelope({ ...CHECKED, id: "2", userName: "plain", isBlueVerified: false });
      if (handle === "legacy") return envelope({ ...CHECKED, id: "4", userName: "legacy", isBlueVerified: false, isVerified: true });
      if (handle === "bot") return envelope({ ...CHECKED, id: "3", userName: "bot", isAutomated: true });
      if (handle === "gone") return envelope({ ...CHECKED, id: "5", userName: "gone", unavailable: true });
      return envelope(null, "error", "user not found");
    });
    await actAs(user);
    clock.freeze();
    expect((await outcome(xStartAction(null, form({ handle: "plain" })))).state?.error).toMatch(/no checkmark/);
    clock.advance(10_000);
    expect((await outcome(xStartAction(null, form({ handle: "bot" })))).state?.error).toMatch(/Automated/);
    clock.advance(10_000);
    expect((await outcome(xStartAction(null, form({ handle: "ghost" })))).state?.error).toBe("That X account can't be found.");
    clock.advance(10_000);
    expect((await outcome(xStartAction(null, form({ handle: "gone" })))).state?.error).toBe("That X account can't be found.");
    expect(await getXChallenge(user.id)).toBeNull();
    clock.advance(10_000);
    expect((await outcome(xStartAction(null, form({ handle: "legacy" })))).state).toBeNull();
    expect((await getXChallenge(user.id))?.handle).toBe("legacy");
  });

  it("validates the handle without spending a lookup, and refuses when already linked", async () => {
    const user = await makeUser();
    const handles = stubX(() => envelope(CHECKED));
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "not a handle" })))).state?.error).toMatch(/X handle/);
    expect(handles).toEqual([]);
    await run("UPDATE users SET x_id = 'already', x_handle = 'someone', x_verified = 1 WHERE id = ?", [user.id]);
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/Unlink it first/);
    expect(handles).toEqual([]);
  });

  it("refuses an X account that another user already linked", async () => {
    const other = await makeUser();
    await run("UPDATE users SET x_id = ?, x_handle = 'yahorbarkouski', x_verified = 1 WHERE id = ?", [CHECKED.id ?? "", other.id]);
    const user = await makeUser();
    stubX(() => envelope(CHECKED));
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(
      /already linked to another/,
    );
    expect(await getXChallenge(user.id)).toBeNull();
  });

  it("reports an unreachable API and a missing key plainly", async () => {
    const user = await makeUser();
    await actAs(user);
    clock.freeze();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toBe("Could not reach X. Try again.");
    clock.advance(10_000);
    stubX(() => envelope(null, "error", "rate limit exceeded"));
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toBe("Could not reach X. Try again.");
    clock.advance(10_000);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toBe("Could not reach X. Try again.");
    clock.advance(10_000);
    vi.stubEnv("TWITTERIO_API_KEY", "");
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toBe("X verification isn't configured.");
  });

  it("spaces lookups ten seconds apart and caps them at ten an hour", async () => {
    clock.freeze();
    const user = await makeUser();
    stubX(() => envelope({ ...CHECKED, isBlueVerified: false }));
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/no checkmark/);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/too fast/);
    for (let i = 1; i < 10; i += 1) {
      clock.advance(10_000);
      expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/no checkmark/);
    }
    clock.advance(10_000);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(
      /Too many verification checks/,
    );
  });

  it("caps lookups per address across accounts", async () => {
    clock.freeze();
    stubX(() => envelope({ ...CHECKED, isBlueVerified: false }));
    request.ip = "192.0.2.77";
    for (let i = 0; i < 2; i += 1) {
      const user = await makeUser();
      await actAs(user);
      for (let j = 0; j < 10; j += 1) {
        expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/no checkmark/);
        clock.advance(10_000);
      }
    }
    const third = await makeUser();
    await actAs(third);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(
      /Too many verification checks/,
    );
    request.ip = "192.0.2.78";
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/no checkmark/);
  });

  it("stops all lookups once the site-wide hourly ceiling is hit", async () => {
    clock.freeze();
    for (let i = 0; i < 120; i += 1) {
      await run("INSERT INTO rate_log (user_id, ip, kind, created_at) VALUES (?, ?, 'verify', ?)", [
        `sock-${i}`,
        `10.1.${Math.floor(i / 250)}.${i % 250}`,
        Date.now() - 60_000,
      ]);
    }
    stubX(() => envelope(CHECKED));
    const user = await makeUser();
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state?.error).toMatch(/busy right now/);
    expect(await getXChallenge(user.id)).toBeNull();
    clock.advance(3_600_000);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state).toBeNull();
  });

  it("sends anonymous users to login", async () => {
    await actAs(null);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).redirect).toBe("/login");
    expect((await outcome(xVerifyAction())).redirect).toBe("/login");
    expect((await outcome(xUnlinkAction())).redirect).toBe("/login");
  });
});

describe("verify", () => {
  it("links the account once the code is in the bio, which establishes it at once", async () => {
    clock.freeze();
    const user = await makeUser();
    stubX(() => envelope(CHECKED));
    await actAs(user);
    expect((await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })))).state).toBeNull();
    const challenge = await getXChallenge(user.id);
    expect(challenge).not.toBeNull();

    clock.advance(10_000);
    expect((await outcome(xVerifyAction())).state?.error).toMatch(/isn't in that bio yet/);
    expect((await getUserByUsername(user.username))?.xHandle).toBeNull();

    clock.advance(10_000);
    stubX(() => envelope({ ...CHECKED, description: `building things ${challenge?.code.toUpperCase()} and more` }));
    expect((await outcome(xVerifyAction())).state).toBeNull();
    const linked = await getUserByUsername(user.username);
    expect(linked?.xHandle).toBe("yahorbarkouski");
    expect(linked?.xVerified).toBe(true);
    expect(linked?.xAvatar).toBe(CHECKED.profilePicture);
    expect(await getXChallenge(user.id)).toBeNull();

    expect(accounted(await loadWorld(Date.now()), user.id, Date.now())).toBe(true);
    const author = await makeUser();
    const take = await plainComment(author, await makeStartup(), "someone's take");
    await vote(user, take);
    expect((await getCommentById(take))?.score).toBeCloseTo(1);
    const own = await plainComment(user, await makeStartup(), "by the verified user");
    expect((await getCommentById(own))?.authorVerified).toBe(true);
    expect((await getCommentById(take))?.authorVerified).toBe(false);
  });

  it("needs a live code and re-checks the checkmark", async () => {
    clock.freeze();
    const user = await makeUser();
    await actAs(user);
    expect((await outcome(xVerifyAction())).state?.error).toBe("Request a code first.");

    stubX(() => envelope(CHECKED));
    await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })));
    clock.advance(X_CODE_TTL_MS + 1);
    expect((await outcome(xVerifyAction())).state?.error).toMatch(/expired/);

    await outcome(xStartAction(null, form({ handle: "yahorbarkouski" })));
    const challenge = await getXChallenge(user.id);
    clock.advance(10_000);
    stubX(() => envelope({ ...CHECKED, description: challenge?.code ?? "", isBlueVerified: false }));
    expect((await outcome(xVerifyAction())).state?.error).toMatch(/no checkmark/);
    expect((await getUserByUsername(user.username))?.xVerified).toBe(false);
  });

  it("never links one X account to two users, even in a race the start check missed", async () => {
    clock.freeze();
    const first = await makeUser();
    const second = await makeUser();
    const code = newXCode();
    await run("UPDATE users SET x_id = ?, x_handle = 'yahorbarkouski', x_verified = 1 WHERE id = ?", [CHECKED.id ?? "", first.id]);
    await setXChallenge(second.id, { handle: "yahorbarkouski", code, expiresAt: Date.now() + X_CODE_TTL_MS });
    stubX(() => envelope({ ...CHECKED, description: `bio with ${code}` }));
    await actAs(second);
    expect((await outcome(xVerifyAction())).state?.error).toMatch(/already linked to another/);
    expect((await getUserByUsername(second.username))?.xHandle).toBeNull();
    expect(await count("users", "x_id = ?", [CHECKED.id ?? ""])).toBe(1);
  });

  it("unlinks and drops the standing that came with it", async () => {
    const user = await makeUser({ verified: true });
    expect(accounted(await loadWorld(Date.now()), user.id, Date.now())).toBe(true);
    await actAs(user);
    expect((await outcome(xUnlinkAction())).state).toBeNull();
    const after = await getUserByUsername(user.username);
    expect(after?.xHandle).toBeNull();
    expect(after?.xVerified).toBe(false);
    expect(accounted(await loadWorld(Date.now()), user.id, Date.now())).toBe(false);
  });
});
