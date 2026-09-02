import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return await import("@/lib/turnstile");
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("verifyTurnstile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is skipped when unconfigured outside production", async () => {
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile(undefined, "signup")).resolves.toBeUndefined();
  });

  it("fails closed in production when unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
  });

  it("requires a token and accepts Cloudflare's answer under the testing secret", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.stubEnv("TURNSTILE_SECRET", "1x0000000000000000000000000000000AA");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
      respond({ success: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile("", "signup")).rejects.toThrow("Complete the bot check.");
    await expect(verifyTurnstile("x".repeat(2049), "signup")).rejects.toThrow("Complete the bot check.");
    await expect(verifyTurnstile(42, "signup")).rejects.toThrow("Complete the bot check.");
    await expect(verifyTurnstile("token", "signup")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("response")).toBe("token");
    expect(body.get("remoteip")).toBe("203.0.113.1");
  });

  it("checks the hostname and action with real keys", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET", "real-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "tradeviction.com");
    let answer: Record<string, unknown> = { success: true, action: "signup", hostname: "tradeviction.com" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(answer)),
    );
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile("token", "signup")).resolves.toBeUndefined();
    answer = { success: true, action: "signup", hostname: "www.tradeviction.com" };
    await expect(verifyTurnstile("token", "signup")).resolves.toBeUndefined();
    answer = { success: true, action: "login", hostname: "tradeviction.com" };
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
    answer = { success: true, action: "signup", hostname: "evil.example" };
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
    answer = { success: false, action: "signup", hostname: "tradeviction.com" };
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
  });

  it("fails closed with real keys but no hostnames configured", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
    vi.stubEnv("TURNSTILE_SECRET", "real-secret");
    const fetchMock = vi.fn(async () => respond({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats network trouble as a failed verification", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    vi.stubEnv("TURNSTILE_SECRET", "1x0000000000000000000000000000000AA");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const { verifyTurnstile } = await load();
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond({}, 500)),
    );
    await expect(verifyTurnstile("token", "signup")).rejects.toThrow("Verification failed.");
  });
});
