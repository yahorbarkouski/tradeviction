import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PartyBoard } from "@/components/PartyBoard";
import { ListSkeleton } from "@/components/Skeleton";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { cachedPartyBoard, cachedPartyBySlug, isPartyMember } from "@/lib/db/parties";
import { partyBlurb, partyTitle } from "@/lib/party";
import { pageMeta } from "@/lib/share";
import { nowMs } from "@/lib/time";
import { heading } from "@/lib/ui";
import type { Party, User } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const party = await cachedPartyBySlug(slug);
  if (!party) return { title: "not found" };
  const rows = await cachedPartyBoard(party.id);
  return pageMeta({
    title: partyTitle(party.name, party.members),
    description: partyBlurb(party.name, party.members, rows),
  });
}

export default function PartyPage({ params }: PageProps<"/p/[slug]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <PartyBody params={params} />
    </Suspense>
  );
}

// The party row and the board are shared entries; whether this viewer may see
// the board is read fresh.
async function PartyBody({ params }: Pick<PageProps<"/p/[slug]">, "params">) {
  const [{ slug }, viewer] = await Promise.all([params, getCurrentUser()]);
  const party = await cachedPartyBySlug(slug);
  if (!party) notFound();
  const member = viewer ? await isPartyMember(party.id, viewer.id) : false;
  if (!viewer || (!member && !isAdmin(viewer))) return <Locked party={party} viewer={viewer} />;
  const rows = await cachedPartyBoard(party.id);
  return (
    <PartyBoard
      party={party}
      rows={rows}
      viewerId={viewer.id}
      member={member}
      manager={party.ownerId === viewer.id || isAdmin(viewer)}
      now={nowMs()}
    />
  );
}

function Locked({ party, viewer }: { party: Party; viewer: User | null }) {
  return (
    <>
      <h1 className={heading}>{party.name}</h1>
      <p className="m-0 text-sm text-mute">
        {party.members} {party.members === 1 ? "member" : "members"} · invite only
      </p>
      <p className="mt-4 text-mute">
        {viewer ? (
          "You are not in this party. Ask a member for the invite link."
        ) : (
          <>
            <Link href={`/login?next=/p/${party.slug}`}>Login</Link> if you are a member, or ask one for
            the invite link.
          </>
        )}
      </p>
    </>
  );
}
