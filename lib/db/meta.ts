// The meta table: version markers for the schema and the catalog.
import { getRow, run } from "@/lib/db";
import { str } from "@/lib/db/codec";

export async function getMeta(key: string): Promise<string | null> {
  const row = await getRow("SELECT value FROM meta WHERE key = ?", [key]);
  return row ? str(row, "value") : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [
    key,
    value,
  ]);
}
