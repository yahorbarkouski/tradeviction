"use server";

import { redirect } from "next/navigation";
import { expire, nextPath, requireTurnstile, type ActionState } from "@/app/actions/lib";
import { isAdmin } from "@/lib/admin";
import { clearSession, hashPassword, setSession, verifyPassword } from "@/lib/auth";
import { createUser, getUserByUsername } from "@/lib/db/users";
import { assertWrite, GuardError, guarded, honeypotFilled, recordWrite } from "@/lib/guard";
import { TAG } from "@/lib/tags";
import type { User } from "@/lib/types";
import { PASSWORD_MAX, PASSWORD_MIN, parseUsername } from "@/lib/validate";
import { rejectDirty } from "@/app/actions/lib";

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (honeypotFilled(formData)) redirect(nextPath(formData, "/"));
  const blocked = await requireTurnstile(formData, "signup");
  if (blocked) return blocked;
  const username = parseUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!username) {
    return { error: "Username must be 2–20 characters, start with a letter, and use only letters, numbers, or _." };
  }
  if (password.length < PASSWORD_MIN) return { error: `Password must be at least ${PASSWORD_MIN} characters.` };
  if (password.length > PASSWORD_MAX) return { error: `Password must be ${PASSWORD_MAX} characters or fewer.` };
  if (await getUserByUsername(username)) return { error: "That username is taken." };
  const actor = isAdmin({ username }) ? { username } : null;
  try {
    await assertWrite("register", actor);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  const dirty = await rejectDirty([username]);
  if (dirty) return dirty;
  let user: User;
  try {
    user = await guarded(
      "register",
      actor,
      () => createUser({ username, passwordHash: hashPassword(password) }),
      (created) => created.id,
    );
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    return { error: "Could not create the account." };
  }
  await setSession(user.id);
  expire(TAG.world, TAG.session);
  redirect(nextPath(formData, "/"));
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (honeypotFilled(formData)) redirect(nextPath(formData, "/"));
  const blocked = await requireTurnstile(formData, "login");
  if (blocked) return blocked;
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  let ip: string;
  try {
    ip = await assertWrite("login", isAdmin({ username }) ? { username } : null);
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  if (password.length > PASSWORD_MAX) return { error: "Wrong username or password." };
  const user = await getUserByUsername(username);
  await recordWrite("login", ip, user?.id ?? null);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Wrong username or password." };
  }
  await setSession(user.id);
  expire(TAG.session);
  redirect(nextPath(formData, "/"));
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  expire(TAG.session);
  redirect("/");
}
