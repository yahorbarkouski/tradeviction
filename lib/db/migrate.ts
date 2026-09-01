import { SCHEMA_VERSION } from "@/lib/db/schema";

type SqlValue = string | number | null | bigint | boolean;

type Query = (
  sql: string,
  params?: SqlValue[],
) => Promise<{ rows: Record<string, unknown>[] }>;

async function hasColumn(query: Query, table: string, column: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return result.rows.length > 0;
}

async function tableExists(query: Query, table: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 AS ok
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ?`,
    [table],
  );
  return result.rows.length > 0;
}

export async function migrate(query: Query): Promise<void> {
  if (await tableExists(query, "users")) {
    if (!(await hasColumn(query, "users", "muted"))) {
      await query("ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0");
    }
    if (!(await hasColumn(query, "users", "show_dead"))) {
      await query("ALTER TABLE users ADD COLUMN show_dead INTEGER NOT NULL DEFAULT 0");
    }
    if (!(await hasColumn(query, "users", "trusted"))) {
      await query("ALTER TABLE users ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0");
    }
  }
  if (await tableExists(query, "meta")) {
    const result = await query("SELECT value FROM meta WHERE key = ?", ["schema"]);
    if (result.rows[0]?.value === SCHEMA_VERSION) return;
  }
  await query(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ["schema", SCHEMA_VERSION],
  );
}
