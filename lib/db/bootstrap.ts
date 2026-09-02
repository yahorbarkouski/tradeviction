import { getRow, run } from "@/lib/db";
import { str } from "@/lib/db/codec";
import { migrate } from "@/lib/db/migrate";
import { SCHEMA, SCHEMA_VERSION } from "@/lib/db/schema";
import { ensureCatalog } from "@/lib/catalog";

const SCHEMA_KEY = "schema";

async function storedSchemaVersion(): Promise<string | null> {
  try {
    const row = await getRow("SELECT value FROM meta WHERE key = ?", [SCHEMA_KEY]);
    return row ? str(row, "value") : null;
  } catch {
    // A fresh database has no meta table yet.
    return null;
  }
}

async function applySchema(): Promise<void> {
  const statements = SCHEMA.split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const statement of statements) await run(statement);
}

async function ensureSchema(): Promise<void> {
  if ((await storedSchemaVersion()) === SCHEMA_VERSION) return;
  await applySchema();
  await migrate();
  await run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    SCHEMA_KEY,
    SCHEMA_VERSION,
  ]);
}

// Runs once per server instance before the first query: two small reads when
// nothing changed, the full schema replay and catalog seed only when it did.
export async function bootstrap(): Promise<void> {
  await ensureSchema();
  await ensureCatalog();
}
