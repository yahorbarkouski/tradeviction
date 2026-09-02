import catalog from "@/data/catalog.json";
import { run } from "@/lib/db";
import { getMeta, insertStartup, purgeHnStartups, setMeta } from "@/lib/db/queries";
import { fnv1a } from "@/lib/hash";

type CatalogRow = {
  name: string;
  url: string;
};

const rows = catalog as CatalogRow[];

const CATALOG_KEY = "catalog";

// Changes whenever data/catalog.json changes, so a revised catalog is seeded
// exactly once instead of being re-checked on every request.
export const CATALOG_VERSION = `catalog-${fnv1a(JSON.stringify(rows))}`;

// Inserts every catalog row that is missing, then records the catalog version.
export async function seedCatalog(): Promise<void> {
  if ((await getMeta("purged_hn")) !== "1") {
    await purgeHnStartups();
    await setMeta("purged_hn", "1");
  }
  // Company one-liners were dropped from the site. The column stays, empty.
  await run("UPDATE startups SET description = '' WHERE description <> ''");
  const now = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    await insertStartup({
      name: row.name,
      url: row.url,
      source: "manual",
      sourceId: null,
      createdAt: now - i * 3_600_000,
    });
  }
  await setMeta(CATALOG_KEY, CATALOG_VERSION);
}

// Seeds only when the stored version differs from the catalog in the code.
export async function ensureCatalog(): Promise<void> {
  if ((await getMeta(CATALOG_KEY)) === CATALOG_VERSION) return;
  await seedCatalog();
}
