"use server";

import { redirect } from "next/navigation";
import { expire, expireComment, nextPath, rejectDirty, requireAdmin, type ActionState } from "@/app/actions/lib";
import { readCurrentUser } from "@/lib/auth";
import {
  deleteCommentTree,
  deleteOwnComment,
  getCommentById,
  insertReply,
  setVote,
  toggleFlag,
  toggleVouch,
  updateComment,
} from "@/lib/db/comments";
import { getKarma } from "@/lib/db/scores";
import { getStartupById } from "@/lib/db/startups";
import { GuardError, guarded, honeypotFilled } from "@/lib/guard";
import { FLAG_KARMA, VOUCH_KARMA } from "@/lib/market";
import { TAG } from "@/lib/tags";
import { commentPath } from "@/lib/thread";

export async function replyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parentId = String(formData.get("parentId") ?? "");
  const [user, parent] = await Promise.all([readCurrentUser(), getCommentById(parentId)]);
  if (!parent) return { error: "Comment not found." };
  const startup = await getStartupById(parent.startupId);
  if (!startup) return { error: "Startup not found." };
  if (!user) redirect(`/login?next=/s/${startup.slug}`);
  if (honeypotFilled(formData)) redirect(`/s/${startup.slug}`);
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2 || text.length > 2000) return { error: "Reply should be 2–2000 characters." };
  const dirty = await rejectDirty([text]);
  if (dirty) return dirty;
  try {
    await guarded("comment", user, () =>
      insertReply({
        startupId: parent.startupId,
        userId: user.id,
        parentId,
        text,
      }),
    );
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  expire(TAG.world);
  expireComment(startup.id);
  // The thread re-renders in place; the pending reply is already on screen.
  return null;
}

export async function voteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const commentId = String(formData.get("commentId") ?? "");
  const [user, comment] = await Promise.all([readCurrentUser(), getCommentById(commentId)]);
  if (!comment) return { error: "Comment not found." };
  if (!user) {
    const startup = await getStartupById(comment.startupId);
    redirect(`/login?next=${encodeURIComponent(nextPath(formData, startup ? `/s/${startup.slug}` : "/"))}`);
  }
  if (comment.userId === user.id) return { error: "You can't vote for your own comment." };
  const want = String(formData.get("op") ?? "up") !== "down";
  try {
    await guarded("vote", user, () => setVote(commentId, user.id, want));
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  expireComment(comment.startupId);
  expire(TAG.leaders);
  return null;
}

// Flags and vouches: one toggle each, open to members with enough Karma.
async function moderateComment(
  formData: FormData,
  minKarma: number,
  apply: (commentId: string, userId: string) => Promise<void>,
): Promise<void> {
  const user = await readCurrentUser();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId, user?.id ?? null);
  if (!comment) return;
  if (!user) {
    const startup = await getStartupById(comment.startupId);
    redirect(`/login?next=${encodeURIComponent(nextPath(formData, startup ? `/s/${startup.slug}` : "/"))}`);
  }
  if (user.muted) return;
  if ((await getKarma(user.id)) < minKarma) return;
  try {
    await guarded("flag", user, () => apply(commentId, user.id));
  } catch {
    return;
  }
  expireComment(comment.startupId);
}

export async function flagAction(formData: FormData): Promise<void> {
  await moderateComment(formData, FLAG_KARMA, toggleFlag);
}

export async function vouchAction(formData: FormData): Promise<void> {
  await moderateComment(formData, VOUCH_KARMA, toggleVouch);
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await readCurrentUser();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId);
  const startup = comment ? await getStartupById(comment.startupId) : null;
  const home = startup ? `/s/${startup.slug}` : "/";
  if (!user) redirect(`/login?next=${encodeURIComponent(home)}`);
  const startupId = await deleteOwnComment(user.id, commentId);
  if (startupId === null) redirect(nextPath(formData, home));
  expireComment(startupId);
  expire(TAG.world, TAG.leaders);
  const dest = nextPath(formData, home);
  if (dest.includes(`/c/${commentId}`)) redirect(home);
  redirect(dest);
}

export async function adminUpdateCommentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId);
  if (!comment) return { error: "Comment not found." };
  const startup = await getStartupById(comment.startupId);
  if (!startup) return { error: "Startup not found." };
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 2 || text.length > 2000) return { error: "Comment should be 2–2000 characters." };
  const dirty = await rejectDirty([text]);
  if (dirty) return dirty;
  await updateComment(commentId, text);
  expireComment(startup.id);
  redirect(nextPath(formData, commentPath(startup.slug, commentId)));
}

export async function adminDeleteCommentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const commentId = String(formData.get("commentId") ?? "");
  const comment = await getCommentById(commentId);
  if (!comment) return;
  const startup = await getStartupById(comment.startupId);
  await deleteCommentTree(commentId);
  expireComment(comment.startupId);
  expire(TAG.world, TAG.leaders);
  const dest = nextPath(formData, startup ? `/s/${startup.slug}` : "/");
  if (startup && dest.includes(`/c/${commentId}`)) redirect(`/s/${startup.slug}`);
  redirect(dest);
}
