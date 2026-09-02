import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as ingest } from "@/app/api/ingest/route";
import { GET as lookup } from "@/app/api/lookup/route";
import { applyBookChange } from "@/lib/db/book";
import { countStartups } from "@/lib/db/startups";
import { loadProfileBook, loadThesis } from "@/lib/share";
import { makeStartup, makeUser, thesis } from "./harness/factories";

describe("ingest route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("seeds the catalog when no cron secret is configured outside production", async () => {
    const response = await ingest(new Request("http://localhost/api/ingest"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await countStartups()).toBeGreaterThan(30);
  });

  it("requires the bearer secret when one is configured", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await ingest(new Request("http://localhost/api/ingest"))).status).toBe(401);
    expect(
      (await ingest(new Request("http://localhost/api/ingest", { headers: { authorization: "Bearer wrong" } }))).status,
    ).toBe(401);
    expect(
      (await ingest(new Request("http://localhost/api/ingest", { headers: { authorization: "Bearer s3cret" } })))
        .status,
    ).toBe(200);
  });

  it("refuses in production without a secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await ingest(new Request("http://localhost/api/ingest"))).status).toBe(401);
  });
});

describe("lookup route", () => {
  it("returns hits as json", async () => {
    await makeStartup("Linear");
    const response = await lookup(new Request("http://localhost/api/lookup?q=linear"));
    const body = (await response.json()) as { hits: { name: string }[] };
    expect(body.hits.map((hit) => hit.name)).toEqual(["Linear"]);
    const empty = (await (await lookup(new Request("http://localhost/api/lookup"))).json()) as { hits: unknown[] };
    expect(empty.hits).toEqual([]);
  });
});

describe("share loaders", () => {
  it("loads a thesis only under its own startup", async () => {
    const alice = await makeUser();
    const s1 = await makeStartup();
    const s2 = await makeStartup();
    const id = await thesis(alice, s1);
    expect((await loadThesis(s1.slug, id))?.comment.id).toBe(id);
    expect(await loadThesis(s2.slug, id)).toBeNull();
    expect(await loadThesis("nope", id)).toBeNull();
    expect(await loadThesis(s1.slug, "nope")).toBeNull();
  });

  it("summarizes a profile book", async () => {
    const alice = await makeUser({ username: "alice" });
    const s1 = await makeStartup();
    const s2 = await makeStartup();
    await applyBookChange({ startupId: s1.id, userId: alice.id, direction: "long", conviction: 10, note: "" });
    await applyBookChange({ startupId: s2.id, userId: alice.id, direction: "short", conviction: 5, note: "" });
    const profile = await loadProfileBook("alice");
    expect(profile?.long).toBe(1);
    expect(profile?.short).toBe(1);
    expect(profile?.stats.deployed).toBe(15);
    expect(await loadProfileBook("ghost")).toBeNull();
  });
});
