import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/lib/db/schema";
import { getRow, run } from "./harness/db";

async function hasTrusted(): Promise<boolean> {
  const row = await getRow(
    "SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'trusted'",
  );
  return row !== undefined;
}

describe("schema", () => {
  it("has the trusted column and records the schema version", async () => {
    expect(await hasTrusted()).toBe(true);
    expect((await getRow("SELECT value FROM meta WHERE key = 'schema'"))?.value).toBe(SCHEMA_VERSION);
  });

  it("adds the trusted column to a database that predates it", async () => {
    await run("ALTER TABLE users DROP COLUMN trusted");
    expect(await hasTrusted()).toBe(false);
    const g = globalThis as typeof globalThis & { __losReady?: Promise<void> };
    g.__losReady = undefined;
    await run("SELECT 1");
    expect(await hasTrusted()).toBe(true);
    const def = await getRow(
      "SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'trusted'",
    );
    expect(def?.is_nullable).toBe("NO");
    expect(String(def?.column_default)).toBe("0");
  });
});
