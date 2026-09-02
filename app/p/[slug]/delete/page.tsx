import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePartyAction } from "@/app/actions/parties";
import { ConfirmDanger } from "@/components/ConfirmDanger";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getPartyBySlug } from "@/lib/db/parties";

export const metadata: Metadata = { title: "delete" };

export default function DeletePartyPage({ params }: PageProps<"/p/[slug]/delete">) {
  return (
    <Suspense fallback={<LineSkeleton />}>
      <DeleteBody params={params} />
    </Suspense>
  );
}

async function DeleteBody({ params }: Pick<PageProps<"/p/[slug]/delete">, "params">) {
  const [viewer, { slug }] = await Promise.all([getCurrentUser(), params]);
  const party = await getPartyBySlug(slug);
  if (!party) notFound();
  if (!viewer || (party.ownerId !== viewer.id && !isAdmin(viewer))) notFound();
  return (
    <ConfirmDanger
      title={`Delete ${party.name}?`}
      body="This removes the party and its board for everyone in it. Nobody's positions change. It cannot be undone."
      action={deletePartyAction}
      cancelHref={`/p/${party.slug}`}
      fields={{ partyId: party.id }}
      confirmLabel="delete party"
    />
  );
}
