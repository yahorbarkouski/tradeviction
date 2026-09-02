import path from "node:path";
import { defineConfig } from "vitest/config";

// Two suites. `unit` covers the pure modules (market formulas, URL identity,
// Book planning) and needs nothing installed. `integration` drives the server
// actions and queries against a real Postgres: a throwaway container by
// default, or the database in TEST_DATABASE_URL.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    teardownTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/*.test.ts"],
          globalSetup: ["test/harness/global-setup.ts"],
          setupFiles: ["test/harness/setup.ts"],
          pool: "forks",
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
