import { afterAll, beforeEach, inject, vi } from "vitest";

process.env.DATABASE_URL = inject("dbUrl");
process.env.SESSION_SECRET = "integration-test-session-secret";
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET;
delete process.env.TURNSTILE_HOSTNAMES;
delete process.env.OPENAI_API_KEY;
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

vi.mock("next/headers", async () => {
  const { request } = await import("./request");
  return {
    headers: async () => new Headers({ "x-forwarded-for": request.ip }),
    cookies: async () => ({
      get: (name: string) =>
        request.cookies.has(name) ? { name, value: request.cookies.get(name) ?? "" } : undefined,
      set: (name: string, value: string) => {
        request.cookies.set(name, value);
      },
      delete: (name: string) => {
        request.cookies.delete(name);
      },
    }),
  };
});

vi.mock("next/navigation", async () => {
  const { RedirectError, NotFoundError } = await import("./request");
  return {
    redirect: (url: string): never => {
      throw new RedirectError(url);
    },
    permanentRedirect: (url: string): never => {
      throw new RedirectError(url);
    },
    notFound: (): never => {
      throw new NotFoundError();
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  refresh: () => {},
}));

beforeEach(async () => {
  vi.useRealTimers();
  const { resetRequest } = await import("./request");
  const { resetDb } = await import("./db");
  resetRequest();
  await resetDb();
});

afterAll(async () => {
  const { closeDb } = await import("./db");
  await closeDb();
});
