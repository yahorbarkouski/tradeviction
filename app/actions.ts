"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, hashPassword, readCurrentUser, setSession, verifyPassword } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import {
  AdminError,
  BookError,
  XLinkError,
  applyBookChange,
  createUser,
  deleteCommentTree,
  deleteStartup,
  deleteUser,
  getCommentById,
  getKarma,
  getStartupByDomain,
  getStartupById,
  getUserByUsername,
  getUserIdByXId,
  getXChallenge,
  insertReply,
  insertStartup,
  linkX,
  setMuted,
  setShowDead,
  setTrusted,
  setVote,
  setXChallenge,
  toggleFlag,
  toggleVouch,
  unlinkX,
  updateComment,
  updateStartup,
} from "@/lib/db/queries";
import {
  PartyError,
  createParty,
  deleteParty,
  getPartyByCode,
  getPartyById,
  isPartyMember,
  joinParty,
  leaveParty,
  rotateInvite,
} from "@/lib/db/parties";
import { NOTE_MAX, PASSWORD_MAX, PASSWORD_MIN, parseNote, parseUsername } from "@/lib/slug";
import { PARTY_NAME_MAX, PARTY_NAME_MIN, invitePath, isInviteCode, parsePartyName } from "@/lib/party";
import { identityFromUrl } from "@/lib/domain";
import { assertWrite, GuardError, guarded, honeypotFilled, recordWrite } from "@/lib/guard";
import { FLAG_KARMA, VOUCH_KARMA } from "@/lib/market";
import { assertClean, assertCleanListing } from "@/lib/moderate";
import { TAG, partyTag, startupTag } from "@/lib/tags";
import { commentPath } from "@/lib/thread";
import { isDirection, type Party, type Startup, type User } from "@/lib/types";
import { verifyTurnstile } from "@/lib/turnstile";
import { X_CODE_TTL_MS, bioHasCode, fetchXProfile, newXCode, parseXHandle, xRefusal, type XProfile } from "@/lib/x";

export type ActionState = { error: string } | null;

// Expires cached reads so the re-render that ships with this action's
// response already shows the write.
function expire(...tags: string[]): void {
  for (const tag of tags) updateTag(tag);
}

// A comment changed: its thread, the front page, and what the viewer has done.
function expireComment(startupId: string): void {
  expire(startupTag(startupId), TAG.front, TAG.session);
}

// A user's standing changed: every ranking and every thread weighs them anew.
function expireStanding(): void {
  expire(TAG.world, TAG.front, TAG.threads, TAG.leaders);
}

async function requireTurnstile(formData: FormData, action: string): Promise<ActionState> {
  try {
    await verifyTurnstile(formData.get("cf-turnstile-response"), action);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

function safePath(value: FormDataEntryValue | null): string | null {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

function nextPath(formData: FormData, fallback: string): string {
  return safePath(formData.get("next")) ?? fallback;
}

async function rejectDirty(texts: Array<string | null | undefined>): Promise<ActionState> {
  try {
    await assertClean(texts);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

async function rejectDirtyListing(input: {
  name: string;
  description: string;
  domain: string;
  url: string;
}): Promise<ActionState> {
  try {
    await assertCleanListing(input);
    return null;
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
}

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

export async function submitStartupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login?next=/submit");
  if (honeypotFilled(formData)) redirect("/");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ident = identityFromUrl(String(formData.get("url") ?? ""));
  if (!ident) return { error: "Need a real http(s) URL or domain." };
  if (name.length < 2 || name.length > 80) return { error: "Name should be 2–80 characters." };
  if (description.length < 8 || description.length > 200) {
    return { error: "One-liner should be 8–200 characters." };
  }
  // The duplicate lookup and the moderation call do not depend on each other.
  const [existing, dirty] = await Promise.all([
    getStartupByDomain(ident.domain),
    rejectDirtyListing({ name, description, domain: ident.domain, url: ident.canonicalUrl }),
  ]);
  if (existing) redirect(`/s/${existing.slug}`);
  if (dirty) return dirty;
  let startup: Startup;
  try {
    startup = await guarded("submit", user, () =>
      insertStartup({
        name,
        description,
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

export async function closeAction(formData: FormData): Promise<void> {
  await bookAction(null, formData);
}

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

export async function showDeadAction(formData: FormData): Promise<void> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  await setShowDead(user.id, formData.get("on") === "1");
  expire(TAG.session);
}

async function requireAdmin(): Promise<User> {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/");
  return user;
}

export async function adminUpdateStartupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const startup = await getStartupById(String(formData.get("startupId") ?? ""));
  if (!startup) return { error: "Startup not found." };
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Name should be 2–80 characters." };
  if (description.length < 8 || description.length > 200) {
    return { error: "One-liner should be 8–200 characters." };
  }
  const ident = identityFromUrl(String(formData.get("url") ?? ""));
  if (!ident) return { error: "Need a real http(s) URL or domain." };
  const dirty = await rejectDirtyListing({
    name,
    description,
    domain: ident.domain,
    url: ident.canonicalUrl,
  });
  if (dirty) return dirty;
  let updated;
  try {
    updated = await updateStartup({
      id: startup.id,
      name,
      description,
      url: ident.canonicalUrl,
    });
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

export async function createPartyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await readCurrentUser();
  if (!user) redirect("/login?next=/parties");
  if (honeypotFilled(formData)) redirect("/parties");
  const name = parsePartyName(String(formData.get("name") ?? ""));
  if (!name) return { error: `Party name should be ${PARTY_NAME_MIN}–${PARTY_NAME_MAX} characters.` };
  const dirty = await rejectDirty([name]);
  if (dirty) return dirty;
  let party: Party;
  try {
    party = await guarded("party", user, () => createParty({ name, ownerId: user.id }));
  } catch (error) {
    if (error instanceof GuardError) return { error: error.message };
    throw error;
  }
  expire(TAG.parties);
  redirect(`/p/${party.slug}`);
}

// The invite code is the only way in. A member who follows their own link
// lands on the board without a second entry in the rate log.
export async function joinPartyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const [user, party] = await Promise.all([readCurrentUser(), isInviteCode(code) ? getPartyByCode(code) : null]);
  if (!party) return { error: "That invite link doesn't work anymore. Ask for a new one." };
  if (!user) redirect(`/login?next=${encodeURIComponent(invitePath(party.inviteCode))}`);
  if (honeypotFilled(formData)) redirect("/parties");
  if (await isPartyMember(party.id, user.id)) redirect(`/p/${party.slug}`);
  try {
    await guarded("party", user, () => joinParty(party.id, user.id));
  } catch (error) {
    if (error instanceof PartyError || error instanceof GuardError) return { error: error.message };
    throw error;
  }
  expire(TAG.parties, partyTag(party.id));
  redirect(`/p/${party.slug}`);
}

async function requireParty(formData: FormData): Promise<{ user: User; party: Party }> {
  const user = await readCurrentUser();
  if (!user) redirect("/login?next=/parties");
  const party = await getPartyById(String(formData.get("partyId") ?? ""));
  if (!party) redirect("/parties");
  return { user, party };
}

// The owner, or the admin.
async function requireManagedParty(formData: FormData): Promise<Party> {
  const { user, party } = await requireParty(formData);
  if (party.ownerId !== user.id && !isAdmin(user)) redirect(`/p/${party.slug}`);
  return party;
}

export async function leavePartyAction(formData: FormData): Promise<void> {
  const { user, party } = await requireParty(formData);
  await leaveParty(party.id, user.id);
  expire(TAG.parties, partyTag(party.id));
  redirect("/parties");
}

export async function rotateInviteAction(formData: FormData): Promise<void> {
  const party = await requireManagedParty(formData);
  await rotateInvite(party.id);
  expire(TAG.parties, partyTag(party.id));
}

export async function deletePartyAction(formData: FormData): Promise<void> {
  const party = await requireManagedParty(formData);
  await deleteParty(party.id);
  expire(TAG.parties, partyTag(party.id));
  redirect("/parties");
}
