import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDeleteStartupAction } from "@/app/actions";
import { ConfirmDanger } from "@/components/ConfirmDanger";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getStartupBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "delete" };

export default async function DeleteStartupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();
  const { slug } = await params;
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
