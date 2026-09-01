"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cx } from "@/lib/cx";

const LINKS = [
  { href: "/?sort=hot", label: "hot" },
  { href: "/?sort=new", label: "new" },
  { href: "/top", label: "top" },
  { href: "/about", label: "about" },
  { href: "/submit", label: "submit" },
] as const;

function isActive(href: string, pathname: string, sort: string | null): boolean {
  if (href.startsWith("/?sort=")) return pathname === "/" && sort === href.slice("/?sort=".length);
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
