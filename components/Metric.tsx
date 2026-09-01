"use client";

import {
  Activity,
  Anchor,
  ArrowUpDown,
  Crosshair,
  Flame,
  Heart,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

const ICONS = {
  pulse: Activity,
  depth: Layers,
  hotness: Flame,
  conviction: Anchor,
  alpha: Crosshair,
  karma: Heart,
  delta: ArrowUpDown,
} as const;

export type MetricId = keyof typeof ICONS;

export const METRIC_NAME: Record<MetricId, string> = {
  pulse: "Pulse",
  depth: "Depth",
  hotness: "Hotness",
  conviction: "Conviction",
  alpha: "Alpha",
  karma: "Karma",
  delta: "Change",
};

export function MetricIcon({ id, className }: { id: MetricId; className?: string }) {
  const Icon: LucideIcon = ICONS[id];
  return (
    <Icon
      size={16}
      strokeWidth={2}
      aria-hidden
      className={cx("shrink-0", className ?? "inline-block h-[1em] w-[1em] align-[-0.125em]")}
    />
  );
}

export function MetricLabel({
  id,
  children,
  className,
}: {
  id: MetricId;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("whitespace-nowrap", className)}>
      <MetricIcon id={id} />
      <span className="ml-[0.15em]">{children ?? METRIC_NAME[id]}</span>
    </span>
  );
}

export function MetricHead({ id, className }: { id: MetricId; className?: string }) {
  return (
    <span className={cx("inline-flex w-full", className)} title={METRIC_NAME[id]}>
      <MetricIcon id={id} />
    </span>
  );
}

export function MetricValue({
  id,
  children,
  className,
}: {
  id: MetricId;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx("inline-flex items-center gap-[0.28em] leading-none whitespace-nowrap tabular-nums", className)}
      title={METRIC_NAME[id]}
    >
      <MetricIcon id={id} className="block h-[0.85em] w-[0.85em]" />
      <span className="sr-only">{METRIC_NAME[id]} </span>
      {children}
    </span>
  );
}
