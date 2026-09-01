import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";
import { heading } from "@/lib/ui";

export const metadata: Metadata = { title: "login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const next = (await searchParams).next ?? "/";
  if (user) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  return (
    <>
      <h1 className={heading}>login</h1>
      <AuthForm mode="login" next={next} turnstileSiteKey={turnstileSiteKey} />
      <p className="mt-4 text-mute">
        No account? <Link href={`/register?next=${encodeURIComponent(next)}`}>Create one</Link>.
      </p>
    </>
  );
}