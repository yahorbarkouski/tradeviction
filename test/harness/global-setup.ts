import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

// One Postgres for the whole run. Set TEST_DATABASE_URL to reuse a database you
// already run (for example the docker compose one); otherwise a throwaway
// container is started and removed at the end.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const given = process.env.TEST_DATABASE_URL;
  if (given) {
    project.provide("dbUrl", given);
    return async () => {};
  }
  const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  project.provide("dbUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
