import Link from "next/link";
import { Suspense } from "react";
import { Favicon } from "@/components/Favicon";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { heading } from "@/lib/ui";
import type { Startup } from "@/lib/types";

// The company's mark, name, and domain. On the company page the name is the
// page title; on a take's page it links back to the company.
export function CompanyHead({ startup, link = false }: { startup: Startup; link?: boolean }) {
  return (
    <header className="mb-0.5 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3">
      <a href={startup.url} rel="noreferrer" target="_blank" className="block leading-none hover:no-underline">
        <Favicon domain={startup.domain} name={startup.name} size={40} />
      </a>
      <div className="min-w-0">
        {link ? (
          <div className={heading}>
            <Link href={`/s/${startup.slug}`}>{startup.name}</Link>
          </div>
        ) : (
          <h1 className={heading}>{startup.name}</h1>
        )}
        <p className="m-0 text-sm text-mute">
          <a href={startup.url} rel="noreferrer" target="_blank">
            {startup.domain}
          </a>
          {startup.source === "hn" && startup.sourceId ? (
            <>
              {" · "}
              <a href={`https://news.ycombinator.com/item?id=${startup.sourceId}`} rel="noreferrer" target="_blank">
                Show HN
              </a>
            </>
          ) : null}
          <Suspense fallback={null}>
            <AdminLinks slug={startup.slug} />
          </Suspense>
        </p>
      </div>
    </header>
  );
}

async function AdminLinks({ slug }: { slug: string }) {
  const viewer = await getCurrentUser();
  if (!isAdmin(viewer)) return null;
  return (
    <>
      {" · "}
      <Link href={`/s/${slug}/edit`}>edit</Link>
      {" · "}
      <Link href={`/s/${slug}/delete`}>delete</Link>
    </>
  );
}
