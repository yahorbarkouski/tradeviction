"use server";

import { redirect } from "next/navigation";
import { expire, expireStanding, requireAdmin, type ActionState } from "@/app/actions/lib";
import { isAdmin } from "@/lib/admin";
import { readCurrentUser } from "@/lib/auth";
import {
  XLinkError,
  deleteUser,
  getUserByUsername,
  getUserIdByXId,
  getXChallenge,
  linkX,
  setMuted,
  setShowDead,
  setTrusted,
  setXChallenge,
  unlinkX,
} from "@/lib/db/users";
import { GuardError, guarded } from "@/lib/guard";
import { TAG } from "@/lib/tags";
import { X_CODE_TTL_MS, bioHasCode, fetchXProfile, newXCode, parseXHandle, xRefusal, type XProfile } from "@/lib/x";

export async function showDeadAction(formData: FormData): Promise<void> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  await setShowDead(user.id, formData.get("on") === "1");
  expire(TAG.session);
}

export async function adminMuteAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const target = await getUserByUsername(username);
  if (!target || isAdmin(target)) {
    redirect(username ? `/u/${username}` : "/");
  }
  await setMuted(target.id, formData.get("on") === "1");
  expireStanding();
}

export async function adminTrustAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const target = await getUserByUsername(username);
  if (!target || isAdmin(target)) {
    redirect(username ? `/u/${username}` : "/");
  }
  await setTrusted(target.id, formData.get("on") === "1");
  expireStanding();
}

export async function adminDeleteUserAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const target = await getUserByUsername(username);
  if (!target) redirect("/");
  if (isAdmin(target)) redirect(`/u/${target.username}`);
  await deleteUser(target.id);
  expireStanding();
  redirect("/");
}

// Step one of linking X: check the handle is a real account with a checkmark
// that nobody else has linked, then hand out a code to put in its bio. Each
// step spends one paid lookup, so both run under the verify rate limit.
export async function xStartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  const handle = parseXHandle(String(formData.get("handle") ?? ""));
  if (!handle) return { error: "Enter your X handle, like @name." };
  if (user.xHandle) return { error: "This account is already linked to X. Unlink it first." };
  let profile: XProfile | null;
  try {
    await guarded("verify", user, async () => undefined);
    profile = await fetchXProfile(handle);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  if (!profile) return { error: "That X account can't be found." };
  const refusal = xRefusal(profile);
  if (refusal) return { error: refusal };
  if (await getUserIdByXId(profile.id)) {
    return { error: "That X account is already linked to another account." };
  }
  await setXChallenge(user.id, { handle: profile.handle, code: newXCode(), expiresAt: Date.now() + X_CODE_TTL_MS });
  expire(TAG.session);
  return null;
}

export async function xVerifyAction(): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  const challenge = await getXChallenge(user.id);
  if (!challenge) return { error: "Request a code first." };
  if (challenge.expiresAt < Date.now()) return { error: "That code expired. Request a new one." };
  let profile: XProfile | null;
  try {
    await guarded("verify", user, async () => undefined);
    profile = await fetchXProfile(challenge.handle);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  if (!profile) return { error: "That X account can't be found." };
  const refusal = xRefusal(profile);
  if (refusal) return { error: refusal };
  if (!bioHasCode(profile.description, challenge.code)) {
    return { error: "The code isn't in that bio yet. Save your bio on X, then try again." };
  }
  try {
    await linkX(user.id, { id: profile.id, handle: profile.handle, avatar: profile.avatar }, Date.now());
  } catch (error) {
    if (error instanceof XLinkError) return { error: error.message };
    throw error;
  }
  expireStanding();
  expire(TAG.session);
  return null;
}

export async function xUnlinkAction(): Promise<void> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  await unlinkX(user.id);
  expireStanding();
  expire(TAG.session);
}
