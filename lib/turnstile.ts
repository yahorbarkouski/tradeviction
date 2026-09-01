import { GuardError, clientIp } from "@/lib/guard";

const DUMMY_PASS_SECRET = "1x0000000000000000000000000000000AA";

function hostnameOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname || null;
  } catch {
    return null;
  }
}

function configuredHostnames(): Set<string> {
  const hosts = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const hostname = hostnameOf(raw);
    if (!hostname) return;
    hosts.add(hostname);
    if (!hostname.startsWith("www.") && hostname.split(".").length === 2) {
      hosts.add(`www.${hostname}`);
    }
  };
  for (const part of (process.env.TURNSTILE_HOSTNAMES ?? "").split(",")) add(part);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return hosts;
}

export const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY ?? "";

export async function verifyTurnstile(token: unknown, action: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET ?? "";
  const expectedHostnames = configuredHostnames();
  if (!secret || !turnstileSiteKey) {
    if (process.env.NODE_ENV === "production") {
      throw new GuardError("Verification failed.");
    }
    return;
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    throw new GuardError("Complete the bot check.");
  }
  const dummy = secret === DUMMY_PASS_SECRET;
  if (!dummy && expectedHostnames.size === 0) {
    throw new GuardError("Verification failed.");
  }
  const ip = await clientIp();
  let result: { success?: unknown; action?: unknown; hostname?: unknown };
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
      }),
    });
    if (!response.ok) throw new GuardError("Verification failed.");
    result = (await response.json()) as { success?: unknown; action?: unknown; hostname?: unknown };
  } catch (error) {
    if (error instanceof GuardError) throw error;
    throw new GuardError("Verification failed.");
  }
  if (result.success !== true) {
    throw new GuardError("Verification failed.");
  }
  if (dummy) return;
  if (
    result.action !== action ||
    typeof result.hostname !== "string" ||
    !expectedHostnames.has(result.hostname)
  ) {
    throw new GuardError("Verification failed.");
  }
}
