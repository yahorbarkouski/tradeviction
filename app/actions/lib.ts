// Helpers shared by the server actions. Not a "use server" module: nothing
// here is reachable from the browser.
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { readCurrentUser } from "@/lib/auth";
import { GuardError } from "@/lib/guard";
import { assertClean, assertCleanListing } from "@/lib/moderate";
import { TAG, startupTag } from "@/lib/tags";
import { verifyTurnstile } from "@/lib/turnstile";
import type { User } from "@/lib/types";

// What a form action hands back to useActionState: an error to show, or null.
export type ActionState = { error: string } | null;

// Expires cached reads so the re-render that ships with this action's
// response already shows the write.
export function expire(...tags: string[]): void {
  for (const tag of tags) updateTag(tag);
}

// A comment changed: its thread, the front page, and what the viewer has done.
export function expireComment(startupId: string): void {
  expire(startupTag(startupId), TAG.front, TAG.session);
}

// A user's standing changed: every ranking and every thread weighs them anew.
export function expireStanding(): void {
  expire(TAG.world, TAG.front, TAG.threads, TAG.leaders);
}

export async function requireTurnstile(formData: FormData, action: string): Promise<ActionState> {
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response"), action);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

export function safePath(value: FormDataEntryValue | null): string | null {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

export function nextPath(formData: FormData, fallback: string): string {
  return safePath(formData.get("next")) ?? fallback;
}

export async function rejectDirty(texts: Array<string | null | undefined>): Promise<ActionState> {
  try {
    await assertClean(texts);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

export async function rejectDirtyListing(input: { name: string; domain: string; url: string }): Promise<ActionState> {
  try {
    await assertCleanListing(input);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

export async function requireAdmin(): Promise<User> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  return user;
}
