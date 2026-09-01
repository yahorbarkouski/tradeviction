import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitForm } from "@/components/SubmitForm";
import { getCurrentUser } from "@/lib/auth";
import { heading, page } from "@/lib/ui";

export const metadata: Metadata = { title: "submit" };

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/submit");
  return (
    <div className={page}>
      <h1 className={heading}>Submit</h1>
      <p className="mb-8 text-mute">
        Companies are keyed by domain, so linear.app and app.linear.app are the same listing. GitHub
        links collapse to github.com/org/repo. See also <Link href="/about" className="">how this works</Link>.
      </p>
      <SubmitForm />
    </div>
  );
}