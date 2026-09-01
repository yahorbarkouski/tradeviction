import { GuardError } from "@/lib/guard";

const ENDPOINT = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";
const BLOCKED = "That text isn't allowed.";
const UNAVAILABLE = "Could not check that text. Try again.";

function piecesOf(texts: Array<string | null | undefined>): string[] {
  return texts.map((text) => (text ?? "").trim()).filter((text) => text.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function anyFlagged(body: unknown): boolean {
  if (!isRecord(body) || !Array.isArray(body.results) || body.results.length === 0) {
    throw new GuardError(UNAVAILABLE);
  }
  for (const row of body.results) {
    if (!isRecord(row) || typeof row.flagged !== "boolean") {
      throw new GuardError(UNAVAILABLE);
    }
    if (row.flagged) return true;
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
