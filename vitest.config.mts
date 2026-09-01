import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/harness/global-setup.ts"],
    setupFiles: ["test/harness/setup.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
  },
});
