import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { getUserById } from "@/lib/db/queries";
import { TAG } from "@/lib/tags";
import type { User } from "@/lib/types";

const COOKIE = "los_session";
const TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

type SessionPayload = {
  userId: string;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to at least 16 characters.");
  }
  return "dev-only-insecure-session-secret";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length, SCRYPT);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof json !== "object" ||
      json === null ||
      !("userId" in json) ||
      !("exp" in json) ||
      typeof json.userId !== "string" ||
      typeof json.exp !== "number"
    ) {
      return null;
    }
    if (json.exp < Date.now()) return null;
    return { userId: json.userId, exp: json.exp };
  } catch {
    return null;
  }
}

export async function setSession(userId: string): Promise<void> {
  const token = encodeSession({
    userId,
    exp: Date.now() + TTL_SECONDS * 1000,
  });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

// Plain session read for Server Actions, which must never trust a cached copy.
export async function readCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const session = decodeSession(token);
  if (!session) return null;
  return await getUserById(session.userId);
}

// Session read for rendering. The result is kept only in the browser's router
// cache, which lets the prefetched App Shell already carry the signed-in
// state. Every action that changes the viewer calls updateTag("session").
export async function getCurrentUser(): Promise<User | null> {
  "use cache: private";
  cacheLife({ stale: 300 });
  cacheTag(TAG.session);
  return readCurrentUser();
}
