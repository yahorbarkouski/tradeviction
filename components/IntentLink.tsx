"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

// Every link prefetches its route's shared App Shell as it scrolls into view.
// Content that depends on the link's own URL (the startup, its thread) is only
// prefetched once the user shows intent, so a page of forty links costs one
// shell instead of forty server renders.
export function IntentLink({ children, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [active, setActive] = useState(false);
  const arm = () => setActive(true);
  return (
    <Link {...props} prefetch={active ? true : null} onMouseEnter={arm} onTouchStart={arm} onFocus={arm}>
      {children}
    </Link>
  );
}
