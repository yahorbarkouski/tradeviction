import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IntentLink } from "@/components/IntentLink";
import { PartyForm } from "@/components/PartyForm";
import { ListSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { listPartiesOf } from "@/lib/db/parties";
import { heading, kicker, page } from "@/lib/ui";
import { cx } from "@/lib/cx";
import type { Party } from "@/lib/types";

export const metadata: Metadata = { title: "parties" };

export default function PartiesPage() {
  return (
    <div className={page}>
      <h1 className={heading}>Parties</h1>
      <p className="mb-6 text-mute">
        A private board for your company or your group chat. Make one, share the invite link, and see who is{" "}
        <span className="text-long">long</span> and <span className="text-short">short</span> what.
      </p>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <PartiesBody />
      </Suspense>
    </div>
  );
}

// The list is the viewer's own, so it is read fresh on every request.
async function PartiesBody() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return (
      <p className="text-mute">
        <Link href="/login?next=/parties">Login</Link> to make or join a party.
      </p>
    );
  }
  const parties = await listPartiesOf(viewer.id);
  return (
    <>
      {parties.length === 0 ? (
        <p className="text-mute">You are not in a party yet.</p>
      ) : (
        <PartyList parties={parties} viewerId={viewer.id} />
      )}
      <div className="mt-8">
        <PartyForm />
      </div>
    </>
  );
}

function PartyList({ parties, viewerId }: { parties: Party[]; viewerId: string }) {
  return (
    <>
      <h2 className={cx(kicker, "mb-1.5")}>Yours</h2>
      <ul className="m-0 list-none p-0">
        {parties.map((party) => (
          <li key={party.id} className="pt-0.5 pb-1.5">
            <IntentLink href={`/p/${party.slug}`}>{party.name}</IntentLink>
            <div className="text-sm text-mute">
              {party.members} {party.members === 1 ? "member" : "members"}
              {party.ownerId === viewerId ? " · owner" : ""}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
