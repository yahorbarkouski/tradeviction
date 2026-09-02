import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, ensureCatalog, seedCatalog } from "@/lib/catalog";
import { countStartups, getMeta } from "@/lib/db/queries";
import { run } from "./harness/db";

describe("catalog seeding", () => {
  it("seeds once per catalog revision and leaves a marker", async () => {
    await ensureCatalog();
    const seeded = await countStartups();
    expect(seeded).toBeGreaterThan(30);
    expect(CATALOG_VERSION).toMatch(/^catalog-[0-9a-f]{8}$/);
    expect(await getMeta("catalog")).toBe(CATALOG_VERSION);

    // The marker matches the code, so a request-time check does nothing more.
    await run("DELETE FROM startups WHERE id = (SELECT id FROM startups ORDER BY created_at LIMIT 1)");
    await ensureCatalog();
    expect(await countStartups()).toBe(seeded - 1);

    // The cron entry point re-inserts what is missing regardless of the marker.
    await seedCatalog();
    expect(await countStartups()).toBe(seeded);
  });

  it("re-seeds when the marker names another revision", async () => {
    await ensureCatalog();
    const seeded = await countStartups();
    await run("DELETE FROM startups WHERE id = (SELECT id FROM startups ORDER BY created_at LIMIT 1)");
    await run("UPDATE meta SET value = 'catalog-00000000' WHERE key = 'catalog'");
    await ensureCatalog();
    expect(await countStartups()).toBe(seeded);
    expect(await getMeta("catalog")).toBe(CATALOG_VERSION);
  });
});
