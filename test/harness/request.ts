// Mutable request context read by the next/headers mock in setup.ts.
// Tests change the caller's IP and cookies here; server actions see it through
// headers() and cookies() exactly as they would in a real request.
export const request = {
  ip: "203.0.113.1",
  cookies: new Map<string, string>(),
};

export function resetRequest(): void {
  request.ip = "203.0.113.1";
  request.cookies.clear();
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
