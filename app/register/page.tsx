import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { LineSkeleton } from "@/components/Skeleton";
import { getCurrentUser } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";
import { heading } from "@/lib/ui";
import { safeNext } from "@/lib/next-path";

export const metadata: Metadata = { title: "register" };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <>
      <h1 className={heading}>create account</h1>
      <Suspense fallback={<LineSkeleton />}>
        <RegisterBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RegisterBody({ searchParams }: Pick<PageProps<"/register">, "searchParams">) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);
  const next = safeNext(query.next);
  if (user) redirect(next);
  return (
    <>
      <AuthForm mode="register" next={next} turnstileSiteKey={turnstileSiteKey} />
      <p className="mt-4 text-mute">
        Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`}>login</Link>
      </p>
    </>
  );
}
