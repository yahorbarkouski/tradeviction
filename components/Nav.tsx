"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cx } from "@/lib/cx";

// Feed and leaderboard links carry URL data, so they prefetch their content
// per link; the rest ride on the shared App Shell.
const LINKS = [
  { href: "/?sort=hot", label: "hot", prefetch: true },
  { href: "/?sort=new", label: "new", prefetch: true },
  { href: "/top", label: "top", prefetch: true },
  { href: "/parties", label: "parties", prefetch: null },
  { href: "/about", label: "about", prefetch: null },
  { href: "/submit", label: "submit", prefetch: null },
] as const;

function isActive(href: string, pathname: string, sort: string | null): boolean {
  if (href.startsWith("/?sort=")) return pathname === "/" && sort === href.slice("/?sort=".length);
  if (href === "/parties") {
    return pathname === "/parties" || pathname.startsWith("/p/") || pathname.startsWith("/join/");
  }
  return pathname === href;
}

function NavBar({
  className,
  sort,
  pathname,
}: {
  className?: string;
  sort: string | null;
  pathname: string;
}) {
  return (
    <nav className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-mute leading-none", className)}>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          prefetch={link.prefetch}
          className={cx(
            "inline-flex min-h-10 items-center md:min-h-0",
            isActive(link.href, pathname, sort) && "text-ink",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function NavInner({ className }: { className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <NavBar className={className} pathname={pathname} sort={search.get("sort")} />;
}

export function Nav({ className }: { className?: string }) {
  return (
    <Suspense
      fallback={
        <NavBar className={className} pathname="" sort={null} />
      }
    >
      <NavInner className={className} />
    </Suspense>
  );
}
