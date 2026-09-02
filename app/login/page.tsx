import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";
import { safeNext } from "@/lib/next-path";
import { heading } from "@/lib/ui";

export const metadata: Metadata = { title: "login" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <h1 className={heading}>login</h1>
      <Suspense fallback={<LineSkeleton />}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function LoginBody({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  const next = safeNext(query.next);
  if (user) redirect(next);
  return (
    <>
      <AuthForm mode="login" next={next} turnstileSiteKey={turnstileSiteKey} />
      <p className="mt-4 text-mute">
        No account? <Link href={`/register?next=${encodeURIComponent(next)}`}>Create one</Link>.
      </p>
    </>
  );
}
