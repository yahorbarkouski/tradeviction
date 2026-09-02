"use server";

import { redirect } from "next/navigation";
import { expire, expireStanding, rejectDirtyListing, requireAdmin, type ActionState } from "@/app/actions/lib";
import { readCurrentUser } from "@/lib/auth";
import {
  AdminError,
  deleteStartup,
  getStartupByDomain,
  getStartupById,
  insertStartup,
  updateStartup,
} from "@/lib/db/startups";
import { identityFromUrl } from "@/lib/domain";
import { GuardError, guarded, honeypotFilled } from "@/lib/guard";
import { TAG, startupTag } from "@/lib/tags";
import type { Startup } from "@/lib/types";

export async function submitStartupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (honeypotFilled(formData)) redirect("/");
  const name = String(formData.get("name") ?? "").trim();
  const ident = identityFromUrl(String(formData.get("url") ?? ""));
  if (!ident) return { error: "Need a real http(s) URL or domain." };
  if (name.length < 2 || name.length > 80) return { error: "Name should be 2–80 characters." };
  // The duplicate lookup and the moderation call do not depend on each other.
  const [existing, dirty] = await Promise.all([
    getStartupByDomain(ident.domain),
    rejectDirtyListing({ name, domain: ident.domain, url: ident.canonicalUrl }),
  ]);
  if (existing) redirect(`/s/${existing.slug}`);
  if (dirty) return dirty;
  let startup: Startup;
  try {
    startup = await guarded("submit", user, () =>
      insertStartup({
        name,
        url: ident.canonicalUrl,
        source: "manual",
        sourceId: null,
        createdAt: Date.now(),
      }),
    );
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  expire(TAG.startups, TAG.world);
  redirect(`/s/${startup.slug}`);
}

export async function adminUpdateStartupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const startup = await getStartupById(String(formData.get("startupId") ?? ""));
  if (!startup) return { error: "Startup not found." };
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Name should be 2–80 characters." };
  const ident = identityFromUrl(String(formData.get("url") ?? ""));
  if (!ident) return { error: "Need a real http(s) URL or domain." };
  const dirty = await rejectDirtyListing({ name, domain: ident.domain, url: ident.canonicalUrl });
  if (dirty) return dirty;
  let updated;
  try {
    updated = await updateStartup({ id: startup.id, name, url: ident.canonicalUrl });
  } catch (error) {
    if (error instanceof AdminError) return { error: error.message };
    throw error;
  }
  expire(TAG.startups, startupTag(startup.id), TAG.front);
  redirect(`/s/${updated.slug}`);
}

export async function adminDeleteStartupAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const startup = await getStartupById(String(formData.get("startupId") ?? ""));
  if (!startup) redirect("/");
  await deleteStartup(startup.id);
  expire(TAG.startups, startupTag(startup.id));
  expireStanding();
  redirect("/");
}
