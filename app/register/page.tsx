import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";
import { heading } from "@/lib/ui";

export const metadata: Metadata = { title: "register" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const next = (await searchParams).next ?? "/";
  if (user) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  return (
    <>
      <h1 className={heading}>create account</h1>
      <AuthForm mode="register" next={next} turnstileSiteKey={turnstileSiteKey} />
      <p className="mt-4 text-mute">
        Already registered? <Link href={`/login?next=${encodeURIComponent(next)}`}>login</Link>
      </p>
    </>
  );
}