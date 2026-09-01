import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StartupView } from "@/app/s/[slug]/view";
import { getStartupBySlug } from "@/lib/db/queries";
import { loadStartupMarket, marketAlt } from "@/lib/share";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded) return { title: "not found" };
  const { startup, market } = loaded;
  return {
    title: startup.name,
    description: marketAlt(startup, market.pulse, market.forming),
  };
}

export default async function StartupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ side?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const startup = await getStartupBySlug(slug);
  if (!startup) notFound();
  return <StartupView startup={startup} preset={null} searchParams={searchParams} />;
}
