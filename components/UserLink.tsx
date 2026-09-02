import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { FRESH_MS } from "@/lib/market";
import { cx } from "@/lib/cx";

export function UserLink({
  username,
  createdAt,
  now,
  className,
  verified = false,
}: {
  username: string;
  createdAt: number;
  now: number;
  className?: string;
  verified?: boolean;
}) {
  return (
    <Link href={`/u/${username}`} className={cx(now - createdAt < FRESH_MS && "text-fresh", className)}>
      {username}
      {verified ? (
        <span className="ml-0.5 text-mute" title="verified on X">
          <BadgeCheck
            role="img"
            aria-label="verified on X"
            strokeWidth={2}
            className="inline-block h-[0.85em] w-[0.85em] align-[-0.1em]"
          />
        </span>
      ) : null}
    </Link>
  );
}
