"use server";

import { redirect } from "next/navigation";
import { expire, rejectDirty, safePath, type ActionState } from "@/app/actions/lib";
import { readCurrentUser } from "@/lib/auth";
import { parseBookChanges, type BookChange } from "@/lib/book";
import { BookError, applyBookChange, applyBookChanges, listHeld } from "@/lib/db/book";
import { getStartupById } from "@/lib/db/startups";
import { GuardError, guarded, honeypotFilled } from "@/lib/guard";
import { TAG, startupTag } from "@/lib/tags";
import { isDirection } from "@/lib/types";
import { NOTE_MAX, parseNote } from "@/lib/validate";

// One position change from the company page: open, flip, resize, rewrite
// the take, or close.
export async function bookAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const startupId = String(formData.get("startupId") ?? "");
  const [user, startup] = await Promise.all([readCurrentUser(), getStartupById(startupId)]);
  if (!startup) return { error: "Startup not found." };
  if (!user) redirect(`/login?next=/s/${startup.slug}`);
  if (honeypotFilled(formData)) redirect(`/s/${startup.slug}`);
  const close = formData.get("close") === "1";
  const directionRaw = String(formData.get("direction") ?? "");
  const convictionRaw = String(formData.get("conviction") ?? "").trim();
  const conviction = convictionRaw === "" ? 0 : Number(convictionRaw);
  const note = close ? "close" : parseNote(String(formData.get("note") ?? ""));
  if (!close && !isDirection(directionRaw)) return { error: "Pick long or short." };
  if (!close && note === null) return { error: `Take should be ${NOTE_MAX} characters or fewer.` };
  if (!Number.isInteger(conviction) || conviction < 0) return { error: "Conviction must be a whole number." };
  if (!close) {
    const dirty = await rejectDirty([typeof note === "string" ? note : null]);
    if (dirty) return dirty;
  }
  try {
    await guarded("book", user, () =>
      applyBookChange({
        startupId,
        userId: user.id,
        direction: isDirection(directionRaw) ? directionRaw : "long",
        conviction: Number.isFinite(conviction) ? conviction : 0,
        note: typeof note === "string" ? note : "",
        close,
      }),
    );
  } catch (error) {
    if (error instanceof BookError || error instanceof GuardError) return { error: error.message };
    return { error: "Could not update the Book." };
  }
  expire(TAG.world, startupTag(startupId), TAG.front, TAG.leaders, TAG.session);
  // Without a destination the page re-renders in place with the new position.
  const next = safePath(formData.get("next"));
  if (next) redirect(next);
  return null;
}

// The Book editor on a profile commits many position changes at once. They
// share one rate-log entry and one transaction: all of them land, or none.
export async function rebalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  if (honeypotFilled(formData)) redirect(`/u/${user.username}`);
  const parsed = parseBookChanges(String(formData.get("changes") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const changes: BookChange[] = [];
  for (const change of parsed.changes) {
    if (change.close) {
      changes.push({ ...change, note: "" });
      continue;
    }
    const note = parseNote(change.note);
    if (note === null) return { error: `Take should be ${NOTE_MAX} characters or fewer.` };
    changes.push({ ...change, note });
  }
  // Only takes that are new or rewritten go through moderation.
  const held = await listHeld(user.id);
  const dirty = await rejectDirty(
    changes
      .filter((change) => !change.close && change.note !== (held.get(change.startupId)?.note ?? ""))
      .map((change) => change.note),
  );
  if (dirty) return dirty;
  try {
    await guarded("book", user, () => applyBookChanges({ userId: user.id, changes }));
  } catch (error) {
    if (error instanceof BookError || error instanceof GuardError) return { error: error.message };
    return { error: "Could not update the Book." };
  }
  expire(TAG.world, TAG.front, TAG.leaders, TAG.session, ...changes.map((change) => startupTag(change.startupId)));
  return null;
}
