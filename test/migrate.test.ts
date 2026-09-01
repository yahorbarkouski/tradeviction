import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { getRow, run } from "./harness/db";

async function hasTrusted(): Promise<boolean> {
  const row = await getRow(
    "SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'trusted'",
  );
  return row !== undefined;
}

// Forces the next query to run the per-instance readiness check again.
function forgetReadiness(): void {
  const g = globalThis as typeof globalThis & { __losReady?: Promise<void> };
  g.__losReady = undefined;
}

describe("schema", () => {
  it("has the trusted column and records a version derived from the schema text", async () => {
    expect(await hasTrusted()).toBe(true);
    expect(SCHEMA_VERSION).toMatch(/^pg-[0-9a-f]{8}$/);
    expect((await getRow("SELECT value FROM meta WHERE key = 'schema'"))?.value).toBe(SCHEMA_VERSION);
  });

  it("replays the schema only when the stored version differs from the code", async () => {
    await run("ALTER TABLE users DROP COLUMN trusted");
    expect(await hasTrusted()).toBe(false);

    // Same version on record: a fresh instance trusts it and issues no DDL.
    forgetReadiness();
    await run("SELECT 1");
    expect(await hasTrusted()).toBe(false);

    // An older version on record, as a database that predates the column would
    // have: the replay and the column migration run once and re-stamp it.
    await run("UPDATE meta SET value = 'market-pg-1' WHERE key = 'schema'");
    forgetReadiness();
    await run("SELECT 1");
    expect(await hasTrusted()).toBe(true);
    const def = await getRow(
      "SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'trusted'",
    );
    expect(def?.is_nullable).toBe("NO");
    expect(String(def?.column_default)).toBe("0");
    expect((await getRow("SELECT value FROM meta WHERE key = 'schema'"))?.value).toBe(SCHEMA_VERSION);
  });
});
