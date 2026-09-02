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
  const xColumns: [string, string][] = [
    ["x_id", "TEXT"],
    ["x_handle", "TEXT"],
    ["x_avatar", "TEXT"],
    ["x_verified", "INTEGER NOT NULL DEFAULT 0"],
    ["x_verified_at", "BIGINT"],
    ["x_code", "TEXT"],
    ["x_code_handle", "TEXT"],
    ["x_code_expires", "BIGINT"],
  ];
  for (const [column, type] of xColumns) {
    if (!(await hasColumn("users", column))) {
      await run(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
    }
  }
  // One X account can vouch for one Tradeviction account. Lives here rather
  // than in SCHEMA because the column must exist before the index can.
  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_x_id ON users(x_id) WHERE x_id IS NOT NULL");
}
