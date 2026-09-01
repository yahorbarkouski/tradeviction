"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, getCurrentUser, hashPassword, setSession, verifyPassword } from "@/lib/auth";
import {
  BookError,
  applyBookChange,
  createUser,
  getCommentById,
  getKarma,
  getStartupByDomain,
  getStartupById,
  getUserByUsername,
  insertReply,
  insertStartup,
  setShowDead,
  setVote,
  toggleFlag,
  toggleVouch,
} from "@/lib/db/queries";
import { parseNote, parseUsername } from "@/lib/slug";
import { identityFromUrl } from "@/lib/domain";
import { assertWrite, GuardError, honeypotFilled, recordWrite } from "@/lib/guard";
import { FLAG_KARMA, VOUCH_KARMA } from "@/lib/market";
import { commentPath } from "@/lib/thread";
import { isDirection } from "@/lib/types";
import { verifyTurnstile } from "@/lib/turnstile";

export type ActionState = { error: string } | null;

function nextPath(formData: FormData, fallback: string): string {
  const next = formData.get("next");
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (honeypotFilled(formData)) redirect(nextPath(formData, "/"));
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response"), "signup");
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const username = parseUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!username) {
    return { error: "Username must be 2–20 characters, start with a letter, and use only letters, numbers, or _." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (await getUserByUsername(username)) return { error: "That username is taken." };
  let ip: string;
  try {
    ip = await assertWrite("register", null);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  try {
    const user = await createUser({
      username,
      passwordHash: hashPassword(password),
    });
    await recordWrite("register", ip, user.id);
    await setSession(user.id);
  } catch {
    return { error: "Could not create the account." };
  }
  redirect(nextPath(formData, "/"));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (honeypotFilled(formData)) redirect(nextPath(formData, "/"));
  let ip: string;
  try {
    ip = await assertWrite("login", null);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const user = await getUserByUsername(username);
  await recordWrite("login", ip, user?.id ?? null);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Wrong username or password." };
  }
  await setSession(user.id);
  redirect(nextPath(formData, "/"));
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

export async function submitStartupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (honeypotFilled(formData)) redirect("/");
  let ip: string;
  try {
    ip = await assertWrite("submit", user);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ident = identityFromUrl(String(formData.get("url") ?? ""));
  if (!ident) return { error: "Need a real http(s) URL or domain." };
  const existing = await getStartupByDomain(ident.domain);
  if (existing) redirect(`/s/${existing.slug}`);
  if (name.length < 2 || name.length > 80) return { error: "Name should be 2–80 characters." };
  if (description.length < 8 || description.length > 200) {
    return { error: "One-liner should be 8–200 characters." };
  }
  const startup = await insertStartup({
    name,
    description,
    url: ident.canonicalUrl,
    source: "manual",
    sourceId: null,
    createdAt: Date.now(),
  });
  await recordWrite("submit", ip, user.id);
  revalidatePath("/");
  redirect(`/s/${startup.slug}`);
}

export async function bookAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const startupId = String(formData.get("startupId") ?? "");
  const startup = await getStartupById(startupId);
  if (!startup) return { error: "Startup not found." };
  if (!user) redirect(`/login?next=/s/${startup.slug}`);
  if (honeypotFilled(formData)) redirect(`/s/${startup.slug}`);
  let ip: string;
  try {
    ip = await assertWrite("book", user);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const close = formData.get("close") === "1";
  const directionRaw = String(formData.get("direction") ?? "");
  const conviction = Number.parseInt(String(formData.get("conviction") ?? "0"), 10);
  const note = close ? "close" : parseNote(String(formData.get("note") ?? ""));
  if (!close && !isDirection(directionRaw)) return { error: "Pick long or short." };
  if (!close && !note) return { error: "Thesis must be 20–500 characters." };
  if (!Number.isInteger(conviction) || conviction < 0) return { error: "Conviction must be a whole number." };
  try {
    await applyBookChange({
      startupId,
      userId: user.id,
      direction: isDirection(directionRaw) ? directionRaw : "long",
      conviction: Number.isFinite(conviction) ? conviction : 0,
      note: typeof note === "string" ? note : "",
      close,
    });
  } catch (error) {
    if (error instanceof BookError) return { error: error.message };
    return { error: "Could not update the Book." };
  }
  await recordWrite("book", ip, user.id);
  revalidatePath(`/s/${startup.slug}`);
  revalidatePath("/");
  revalidatePath(`/u/${user.username}`);
  redirect(nextPath(formData, `/s/${startup.slug}`));
}

export async function closeAction(formData: FormData): Promise<void> {
  await bookAction(null, formData);
}

export async function replyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const parentId = String(formData.get("parentId") ?? "");
  const parent = await getCommentById(parentId);
  if (!parent) return { error: "Comment not found." };
  const startup = await getStartupById(parent.startupId);
  if (!startup) return { error: "Startup not found." };
  if (!user) redirect(`/login?next=/s/${startup.slug}`);
  if (honeypotFilled(formData)) redirect(`/s/${startup.slug}`);
  let ip: string;
  try {
    ip = await assertWrite("comment", user);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2 || text.length > 2000) return { error: "Reply should be 2–2000 characters." };
  await insertReply({
    startupId: parent.startupId,
    userId: user.id,
    parentId,
    text,
  });
  await recordWrite("comment", ip, user.id);
  revalidatePath(`/s/${startup.slug}`);
  revalidatePath(commentPath(startup.slug, parentId));
  const dest = nextPath(formData, `/s/${startup.slug}`);
  redirect(dest.includes("/c/") ? dest : `${dest}#${parentId}`);
}

export async function voteAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId);
  if (!comment) return;
  const startup = await getStartupById(comment.startupId);
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath(formData, startup ? `/s/${startup.slug}` : "/"))}`);
  }
  if (user.muted) return;
  try {
    const ip = await assertWrite("vote", user);
    await setVote(commentId, user.id, String(formData.get("op") ?? "up") !== "down");
    await recordWrite("vote", ip, user.id);
  } catch (error) {
    if (error instanceof GuardError) return;
    return;
  }
  revalidatePath("/");
  if (startup) revalidatePath(`/s/${startup.slug}`);
}

async function moderateComment(
  formData: FormData,
  minKarma: number,
  apply: (commentId: string, userId: string) => Promise<void>,
): Promise<void> {
  const user = await getCurrentUser();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId, user?.id ?? null);
  if (!comment) return;
  const startup = await getStartupById(comment.startupId);
  const dest = nextPath(formData, startup ? `/s/${startup.slug}` : "/");
  if (!user) redirect(`/login?next=${encodeURIComponent(dest)}`);
  if (user.muted) return;
  if ((await getKarma(user.id)) < minKarma) return;
  try {
    const ip = await assertWrite("flag", user);
    await apply(commentId, user.id);
    await recordWrite("flag", ip, user.id);
  } catch (error) {
    if (error instanceof GuardError) return;
    return;
  }
  revalidatePath("/");
  if (startup) revalidatePath(`/s/${startup.slug}`);
}

export async function flagAction(formData: FormData): Promise<void> {
  await moderateComment(formData, FLAG_KARMA, toggleFlag);
}

export async function vouchAction(formData: FormData): Promise<void> {
  await moderateComment(formData, VOUCH_KARMA, toggleVouch);
}

export async function showDeadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setShowDead(user.id, formData.get("on") === "1");
  revalidatePath("/");
  revalidatePath(`/u/${user.username}`);
}
