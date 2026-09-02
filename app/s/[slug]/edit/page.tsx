import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditStartupForm } from "@/components/EditStartupForm";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getStartupBySlug } from "@/lib/db/startups";
import { heading, page } from "@/lib/ui";

export const metadata: Metadata = { title: "edit" };

export default function EditStartupPage({ params }: PageProps<"/s/[slug]/edit">) {
  return (
    <div className={page}>
      <Suspense fallback={<LineSkeleton />}>
        <EditBody params={params} />
      </Suspense>
    </div>
  );
}

async function EditBody({ params }: Pick<PageProps<"/s/[slug]/edit">, "params">) {
  const [user, { slug }] = await Promise.all([getCurrentUser(), params]);
  if (!isAdmin(user)) notFound();
  const startup = await getStartupBySlug(slug);
  if (!startup) notFound();
  return (
    <>
      <h1 className={heading}>Edit {startup.name}</h1>
      <p className="mb-8 text-mute">The slug stays the same. Positions and comments stay attached.</p>
      <EditStartupForm startup={startup} />
    </>
  );
}
