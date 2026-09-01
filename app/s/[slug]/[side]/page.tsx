import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StartupView } from "@/app/s/[slug]/view";
import { getStartupBySlug } from "@/lib/db/queries";
import { loadStartupMarket, stanceAlt } from "@/lib/share";
import { isDirection } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; side: string }>;
}): Promise<Metadata> {
  const { slug, side } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded || !isDirection(side)) return { title: "not found" };
  return {
    title: `${side} ${loaded.startup.name}`,
    description: stanceAlt(side, loaded.startup, loaded.market.pulse),
  };
}

export default async function StancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; side: string }>;
  searchParams: Promise<{ side?: string; sort?: string }>;
}) {
  const { slug, side } = await params;
  const startup = await getStartupBySlug(slug);
  if (!startup || !isDirection(side)) notFound();
  return <StartupView startup={startup} preset={side} searchParams={searchParams} />;
}
