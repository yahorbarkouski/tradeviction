import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDeleteStartupAction } from "@/app/actions";
import { ConfirmDanger } from "@/components/ConfirmDanger";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getStartupBySlug } from "@/lib/db/queries";

export const metadata: Metadata = { title: "delete" };

export default function DeleteStartupPage({ params }: PageProps<"/s/[slug]/delete">) {
  return (
    <Suspense fallback={<LineSkeleton />}>
      <DeleteBody params={params} />
    </Suspense>
  );
}

async function DeleteBody({ params }: Pick<PageProps<"/s/[slug]/delete">, "params">) {
  const [user, { slug }] = await Promise.all([getCurrentUser(), params]);
  if (!isAdmin(user)) notFound();
  const startup = await getStartupBySlug(slug);
  if (!startup) notFound();
  return (
    <ConfirmDanger
      title={`Delete ${startup.name}?`}
      body="This removes the company, every position on it, and every comment. It cannot be undone."
      action={adminDeleteStartupAction}
      cancelHref={`/s/${startup.slug}`}
      fields={{ startupId: startup.id }}
      confirmLabel="delete company"
    />
  );
}
