import { GuardError } from "@/lib/guard";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
const BLOCKED = "That text isn't allowed.";
const UNAVAILABLE = "Could not check that text. Try again.";

const ADULT_HOSTS = new Set([
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "spankbang.com",
  "redtube.com",
  "youporn.com",
  "tube8.com",
  "chaturbate.com",
  "stripchat.com",
  "livejasmin.com",
  "onlyfans.com",
  "fansly.com",
  "manyvids.com",
  "brazzers.com",
  "nhentai.net",
  "rule34.xxx",
]);

function piecesOf(texts: Array<string | null | undefined>): string[] {
  return texts.map((text) => (text ?? "").trim()).filter((text) => text.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hostOf(domain: string): string {
  return (domain.split("/")[0] ?? "").replace(/^www\./i, "").toLowerCase();
}

function isAdultHost(domain: string): boolean {
  const host = hostOf(domain);
  if (!host) return false;
  if (host.includes("porn") || host.includes(".xxx") || host.endsWith(".xxx")) return true;
  for (const blocked of ADULT_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function rowBlocked(row: Record<string, unknown>): boolean {
  if (row.flagged === true) return true;
  const cats = row.categories;
  if (!isRecord(cats)) return false;
  return cats.sexual === true || cats["sexual/minors"] === true;
}

function anyFlagged(body: unknown): boolean {
  if (!isRecord(body) || !Array.isArray(body.results) || body.results.length === 0) {
    throw new GuardError(UNAVAILABLE);
  }
  for (const row of body.results) {
    if (!isRecord(row) || typeof row.flagged !== "boolean") {
      throw new GuardError(UNAVAILABLE);
    }
    if (rowBlocked(row)) return true;
  }
  return false;
}

export async function assertClean(texts: Array<string | null | undefined>): Promise<void> {
  const pieces = piecesOf(texts);
  if (pieces.length === 0) return;
  const key = process.env.OPENAI_API_KEY ?? "";
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new GuardError(UNAVAILABLE);
    return;
  }
  let body: unknown;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        model: MODEL,
        input: pieces.map((text) => ({ type: "text", text })),
      }),
    });
    if (!response.ok) throw new GuardError(UNAVAILABLE);
    body = await response.json();
  } catch (error) {
    if (error instanceof GuardError) throw error;
    throw new GuardError(UNAVAILABLE);
  }
  if (anyFlagged(body)) throw new GuardError(BLOCKED);
}

export async function assertCleanListing(input: { name: string; domain: string; url: string }): Promise<void> {
  if (isAdultHost(input.domain) || isAdultHost(input.url.replace(/^https?:\/\//i, ""))) {
    throw new GuardError(BLOCKED);
  }
  const card = `Name: ${input.name}\nDomain: ${input.domain}\nURL: ${input.url}`;
  await assertClean([input.url, card]);
}
