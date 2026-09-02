import { randomBytes } from "node:crypto";
import { GuardError } from "@/lib/guard";

const BASE = "https://api.twitterapi.io";
const UNREACHABLE = "Could not reach X. Try again.";

export const X_CODE_TTL_MS = 20 * 60_000;
export const X_CODE_PREFIX = "tv-";

// No i, l, o, 0, or 1: the code is read off a screen and typed into a bio.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type XProfile = {
  id: string;
  handle: string;
  name: string;
  description: string;
  avatar: string | null;
  checkmark: boolean;
  automated: boolean;
};

export function parseXHandle(raw: string): string | null {
  const handle = raw
    .trim()
    .replace(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

export function newXCode(): string {
  let out = "";
  for (const byte of randomBytes(8)) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${X_CODE_PREFIX}${out}`;
}

// The API hands back the 48px variant; X also serves _bigger, _200x200, and _400x400.
export function xAvatarUrl(url: string, size: "normal" | "bigger" | "200x200" | "400x400" = "200x200"): string {
  return url.replace(/_normal(\.[a-z]+)$/i, `_${size}$1`);
}

export function bioHasCode(description: string, code: string): boolean {
  return description.toLowerCase().includes(code.toLowerCase());
}

// Why a profile cannot fast-track an account, or null when it can.
export function xRefusal(profile: XProfile): string | null {
  if (profile.automated) return "Automated X accounts can't be linked.";
  if (!profile.checkmark) return "That X account has no checkmark.";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

// twitterapi.io answers HTTP 200 with status "error" for a missing user, so the
// envelope, not the status code, decides. Null means no such account.
export async function fetchXProfile(handle: string): Promise<XProfile | null> {
  const key = process.env.TWITTERIO_API_KEY ?? "";
  if (!key) throw new GuardError("X verification isn't configured.");
  let body: unknown;
  try {
    const response = await fetch(`${BASE}/twitter/user/info?userName=${encodeURIComponent(handle)}`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GuardError(UNREACHABLE);
    body = await response.json();
  } catch (error) {
    if (error instanceof GuardError) throw error;
    throw new GuardError(UNREACHABLE);
  }
  if (!isRecord(body)) throw new GuardError(UNREACHABLE);
  if (body.status !== "success") {
    if (typeof body.msg === "string" && /not found/i.test(body.msg)) return null;
    throw new GuardError(UNREACHABLE);
  }
  const data = body.data;
  if (!isRecord(data) || data.unavailable === true) return null;
  const id = text(data.id);
  const userName = text(data.userName);
  if (!id || !userName) return null;
  const avatar = text(data.profilePicture);
  return {
    id,
    handle: userName,
    name: text(data.name) || userName,
    description: text(data.description),
    avatar: avatar || null,
    checkmark: data.isBlueVerified === true || data.isVerified === true,
    automated: data.isAutomated === true,
  };
}
