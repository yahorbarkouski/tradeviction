import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LineSkeleton } from "@/components/Skeleton";
import { SubmitForm } from "@/components/SubmitForm";
import { getCurrentUser } from "@/lib/auth";
import { heading, page } from "@/lib/ui";

export const metadata: Metadata = { title: "submit" };

export default function SubmitPage() {
  return (
    <div className={page}>
      <h1 className={heading}>Submit</h1>
      <p className="mb-8 text-mute">
        Companies are keyed by domain, so linear.app and app.linear.app are the same listing. GitHub links collapse to
        github.com/org/repo. See also <Link href="/about">how this works</Link>.
      </p>
      <Suspense fallback={<LineSkeleton />}>
        <SubmitBody />
      </Suspense>
    </div>
  );
}

async function SubmitBody() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  return <SubmitForm />;
}
