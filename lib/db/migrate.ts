import { getRow, run } from "@/lib/db";

async function hasColumn(table: string, column: string): Promise<boolean> {
  const row = await getRow(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return row !== undefined;
}

// Columns added after the first schema shipped. Runs only when the stored
// schema version differs from the code, right after the schema replay.
export async function migrate(): Promise<void> {
  if (!(await hasColumn("users", "muted"))) {
    await run("ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0");
  }
  if (!(await hasColumn("users", "show_dead"))) {
    await run("ALTER TABLE users ADD COLUMN show_dead INTEGER NOT NULL DEFAULT 0");
  }
  if (!(await hasColumn("users", "trusted"))) {
    await run("ALTER TABLE users ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0");
  }
}
