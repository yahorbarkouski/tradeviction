import { describe, expect, it } from "vitest";
import { submitStartupAction } from "@/app/actions/startups";
import { ensureCatalog } from "@/lib/catalog";
import { countStartups, getStartupBySlug, insertStartup, lookupStartups } from "@/lib/db/startups";
import { DAY_MS } from "@/lib/time";
import { count, getRow, run } from "./harness/db";
import { actAs, clock, form, makeStartup, makeUser, outcome, submit } from "./harness/factories";

const HOUR = 3_600_000;

describe("submitting a company", () => {
  it("creates the listing with a canonical url and slug, logs the submit, and redirects to it", async () => {
    const user = await makeUser();
    const result = await submit(user, {
      url: "https://www.Linear.app/pricing?ref=x",
      name: "Linear",
    });
    expect(result.redirect).toBe("/s/linear");
    const startup = await getStartupBySlug("linear");
    expect(startup?.domain).toBe("linear.app");
    expect(startup?.url).toBe("https://linear.app");
    expect(startup?.source).toBe("manual");
    expect(await count("rate_log", "kind = 'submit' AND user_id = ?", [user.id])).toBe(1);
  });

  it("redirects to the existing listing when the domain is already known", async () => {
    const existing = await makeStartup("Acme");
    const user = await makeUser();
    const result = await submit(user, { url: "http://acme.com/about", name: "Acme Again" });
    expect(result.redirect).toBe(`/s/${existing.slug}`);
    expect(await countStartups()).toBe(1);
    expect(await count("rate_log", "kind = 'submit'")).toBe(0);
  });

  it("validates the url and name", async () => {
    const user = await makeUser();
    expect((await submit(user, { url: "not a url", name: "Fine" })).state?.error).toBe(
      "Need a real http(s) URL or domain.",
    );
    expect((await submit(user, { url: "fine.com", name: "A" })).state?.error).toMatch(/Name should be/);
    expect(await countStartups()).toBe(0);
  });

  it("blocks adult hosts without any moderation key", async () => {
    const user = await makeUser();
    const result = await submit(user, { url: "https://pornhub.com", name: "Nope" });
    expect(result.state?.error).toBe("That text isn't allowed.");
    expect(await countStartups()).toBe(0);
  });

  it("spaces submissions by account age", async () => {
    clock.freeze();
    const cases: [number, number][] = [
      [0, 6 * HOUR],
      [3 * DAY_MS, 2 * HOUR],
      [8 * DAY_MS, 30 * 60_000],
    ];
    for (const [age, gap] of cases) {
      const user = await makeUser({ createdAt: Date.now() - age });
      expect((await submit(user, { url: `first-${age}.com`, name: "First" })).redirect).toMatch(/^\/s\//);
      expect((await submit(user, { url: `second-${age}.com`, name: "Second" })).state?.error).toMatch(/too fast/);
      clock.advance(gap);
      expect((await submit(user, { url: `second-${age}.com`, name: "Second" })).redirect).toMatch(/^\/s\//);
    }
  });

  it("sends anonymous users to login and drops honeypot submissions", async () => {
    await actAs(null);
    const anonymous = await outcome(submitStartupAction(null, form({ url: "fine.com", name: "Fine" })));
    expect(anonymous.redirect).toBe("/login?next=/submit");
    const user = await makeUser();
    const bot = await submit(user, { url: "fine.com", name: "Fine", website: "spam" });
    expect(bot.redirect).toBe("/");
    expect(await countStartups()).toBe(0);
  });
});

describe("insertStartup", () => {
  it("dedupes by domain and source id, and suffixes clashing slugs", async () => {
    const base = { source: "manual" as const, sourceId: null, createdAt: Date.now() };
    const first = await insertStartup({ ...base, name: "Same Name", url: "https://one.com" });
    const second = await insertStartup({ ...base, name: "Same Name", url: "https://two.com" });
    expect(first.slug).toBe("same-name");
    expect(second.slug).toBe("same-name-2");
    const dup = await insertStartup({ ...base, name: "Other", url: "https://www.one.com/anything" });
    expect(dup.id).toBe(first.id);

    const hn = await insertStartup({
      ...base,
      name: "HN Thing",
      url: "https://three.com",
      source: "hn",
      sourceId: "123",
    });
    const hnAgain = await insertStartup({
      ...base,
      name: "HN Thing Renamed",
      url: "https://four.com",
      source: "hn",
      sourceId: "123",
    });
    expect(hnAgain.id).toBe(hn.id);
    expect(await countStartups()).toBe(3);
  });
});

describe("lookup", () => {
  it("finds by domain, name, or url and marks the exact domain match", async () => {
    await makeStartup("Linear");
    await makeStartup("Linearity Labs");
    await makeStartup("Unrelated");
    expect((await lookupStartups("linear")).map((hit) => hit.name)).toEqual(["Linear", "Linearity Labs"]);
    const exact = await lookupStartups("https://linear.com/some/page");
    expect(exact[0]).toMatchObject({ name: "Linear", exact: true });
    expect(exact.slice(1).every((hit) => !hit.exact)).toBe(true);
    expect(await lookupStartups("l")).toEqual([]);
    expect(await lookupStartups("%_")).toEqual([]);
    expect(await lookupStartups("%%%")).toEqual([]);
    expect(await lookupStartups("zzz-nothing")).toEqual([]);
  });
});

describe("catalog", () => {
  it("seeds every listed company once", async () => {
    await ensureCatalog();
    const first = await countStartups();
    expect(first).toBeGreaterThan(30);
    await ensureCatalog();
    expect(await countStartups()).toBe(first);
    expect(await getStartupBySlug("openai")).not.toBeNull();
  });

  it("blanks any one-liner left in the table", async () => {
    await run(
      `INSERT INTO startups (id, slug, name, description, url, domain, source, source_id, created_at)
       VALUES ('old', 'old', 'Old', 'Had a one-liner', 'https://old.example', 'old.example', 'manual', NULL, 1)`,
    );
    await ensureCatalog();
    expect(await getRow("SELECT description FROM startups WHERE id = 'old'")).toEqual({ description: "" });
  });
});
