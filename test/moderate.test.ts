import { afterEach, describe, expect, it, vi } from "vitest";
import { assertClean, assertCleanListing } from "@/lib/moderate";

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("assertClean", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("skips without a key outside production and fails closed in production", async () => {
    await expect(assertClean(["anything"])).resolves.toBeUndefined();
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertClean(["anything"])).rejects.toThrow("Could not check that text. Try again.");
  });

  it("never calls the service for empty input", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertClean(["", "   ", null, undefined])).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks text the model flags, including sexual categories", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    let body: unknown = { results: [{ flagged: true, categories: {} }] };
    vi.stubGlobal("fetch", vi.fn(async () => respond(body)));
    await expect(assertClean(["bad"])).rejects.toThrow("That text isn't allowed.");
    body = { results: [{ flagged: false, categories: { sexual: true } }] };
    await expect(assertClean(["bad"])).rejects.toThrow("That text isn't allowed.");
    body = { results: [{ flagged: false, categories: { violence: true } }] };
    await expect(assertClean(["fine"])).resolves.toBeUndefined();
  });

  it("treats bad answers and outages as unavailable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 500)));
    await expect(assertClean(["text"])).rejects.toThrow("Could not check that text. Try again.");
    vi.stubGlobal("fetch", vi.fn(async () => respond({ results: [] })));
    await expect(assertClean(["text"])).rejects.toThrow("Could not check that text. Try again.");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await expect(assertClean(["text"])).rejects.toThrow("Could not check that text. Try again.");
  });
});

describe("assertCleanListing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["pornhub.com", "https://www.xvideos.com/x", "sub.onlyfans.com", "foo.xxx", "porn-place.net"])(
    "blocks %s before any network call",
    async (host) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        assertCleanListing({ name: "x", domain: host.replace(/^https?:\/\//, ""), url: host }),
      ).rejects.toThrow("That text isn't allowed.");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("lets an ordinary listing through without a key", async () => {
    await expect(
      assertCleanListing({ name: "Acme", domain: "acme.com", url: "https://acme.com" }),
    ).resolves.toBeUndefined();
  });
});
