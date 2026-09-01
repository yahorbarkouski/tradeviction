import Link from "next/link";
import { FRESH_MS } from "@/lib/market";
import { cx } from "@/lib/cx";

export function UserLink({
  username,
  createdAt,
  now,
  className,
}: {
  username: string;
  createdAt: number;
  now: number;
  className?: string;
}) {
  return (
    <Link href={`/u/${username}`} className={cx(now - createdAt < FRESH_MS && "text-fresh", className)}>
      {username}
    </Link>
  );
}
