"use server";

import { redirect } from "next/navigation";
import { expire, rejectDirty, type ActionState } from "@/app/actions/lib";
import { isAdmin } from "@/lib/admin";
import { readCurrentUser } from "@/lib/auth";
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
import { GuardError, guarded, honeypotFilled } from "@/lib/guard";
import { PARTY_NAME_MAX, PARTY_NAME_MIN, invitePath, isInviteCode, parsePartyName } from "@/lib/party";
import { TAG, partyTag } from "@/lib/tags";
import type { Party, User } from "@/lib/types";

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
