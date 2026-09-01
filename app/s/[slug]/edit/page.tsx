import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditStartupForm } from "@/components/EditStartupForm";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getStartupBySlug } from "@/lib/db/queries";
import { heading, page } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "edit" };

export default async function EditStartupPage({
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
    <div className={page}>
      <h1 className={heading}>Edit {startup.name}</h1>
      <p className="mb-8 text-mute">The slug stays the same. Positions and comments stay attached.</p>
      <EditStartupForm startup={startup} />
    </div>
  );
}
