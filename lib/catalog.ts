import catalog from "@/data/catalog.json";
import { getMeta, insertStartup, purgeHnStartups, setMeta } from "@/lib/db/queries";

type CatalogRow = {
  name: string;
  url: string;
  description: string;
};

export async function ensureCatalog(): Promise<void> {
  if ((await getMeta("purged_hn")) !== "1") {
    await purgeHnStartups();
    await setMeta("purged_hn", "1");
  }
  const rows = catalog as CatalogRow[];
  const now = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    await insertStartup({
      name: row.name,
      description: row.description,
      url: row.url,
      source: "manual",
      sourceId: null,
      createdAt: now - i * 3_600_000,
    });
  }
}
