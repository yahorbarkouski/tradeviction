import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { JoinPartyForm } from "@/components/JoinPartyForm";
import { MetricLabel } from "@/components/Metric";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { cachedPartyBoard, getPartyByCode, isPartyMember } from "@/lib/db/parties";
import { inviteBlurb, invitePath, inviteTitle, isInviteCode } from "@/lib/party";
import { pageMeta } from "@/lib/share";
import { heading, page } from "@/lib/ui";

// The invite link is what gets pasted around, so its preview carries the party.
export async function generateMetadata({ params }: PageProps<"/join/[code]">): Promise<Metadata> {
  const { code } = await params;
  const party = isInviteCode(code) ? await getPartyByCode(code) : null;
  if (!party) return { title: "join" };
  const rows = await cachedPartyBoard(party.id);
  return pageMeta({
    title: inviteTitle(party.name),
    tab: `Join ${party.name}`,
    description: inviteBlurb(party.name, party.members, rows),
  });
}

export default function JoinPage({ params }: PageProps<"/join/[code]">) {
  return (
    <div className={page}>
      <Suspense fallback={<LineSkeleton />}>
        <JoinBody params={params} />
      </Suspense>
    </div>
  );
}

// Invite links are looked up fresh: a replaced link must stop working at once.
async function JoinBody({ params }: Pick<PageProps<"/join/[code]">, "params">) {
  const [{ code }, viewer] = await Promise.all([params, getCurrentUser()]);
  const party = isInviteCode(code) ? await getPartyByCode(code) : null;
  if (!party) {
    return (
      <>
        <h1 className={heading}>invite not found</h1>
        <p className="text-mute">This link doesn&apos;t work anymore. Ask a member of the party for a new one.</p>
      </>
    );
  }
  if (viewer && (await isPartyMember(party.id, viewer.id))) redirect(`/p/${party.slug}`);
  const next = encodeURIComponent(invitePath(party.inviteCode));
  return (
    <>
      <h1 className={heading}>Join {party.name}?</h1>
      <p className="mb-6 text-mute">
        {party.members} {party.members === 1 ? "member" : "members"}. Everyone in a party sees each
        other&apos;s positions, ranked by <MetricLabel id="alpha" />.
      </p>
      {viewer ? (
        <JoinPartyForm code={party.inviteCode} />
      ) : (
        <p className="text-mute">
          <Link href={`/login?next=${next}`}>Login</Link> or{" "}
          <Link href={`/register?next=${next}`}>create an account</Link> to join.
        </p>
      )}
    </>
  );
}
