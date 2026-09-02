// Mutable request context read by the next/headers mock in setup.ts.
// Tests change the caller's IP and cookies here; server actions see it through
// headers() and cookies() exactly as they would in a real request.
export const request = {
  ip: "203.0.113.1",
  cookies: new Map<string, string>(),
};

// Everything the next/cache mock was asked to do since the last reset.
export const cacheCalls = {
  revalidatePath: [] as string[],
  revalidateTag: [] as string[],
  updateTag: [] as string[],
  cacheTag: [] as string[],
  refresh: 0,
};

export function resetRequest(): void {
  request.ip = "203.0.113.1";
  request.cookies.clear();
  cacheCalls.revalidatePath = [];
  cacheCalls.revalidateTag = [];
  cacheCalls.updateTag = [];
  cacheCalls.cacheTag = [];
  cacheCalls.refresh = 0;
}

export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
    this.name = "RedirectError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
    this.name = "NotFoundError";
  }
}
