import type { Metadata } from "next";
import { StartupView } from "@/app/s/[slug]/view";
import { loadStartupMarket, stanceAlt } from "@/lib/share";
import { isDirection } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/[side]">): Promise<Metadata> {
  const { slug, side } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded || !isDirection(side)) return { title: "not found" };
  return {
    title: `${side} ${loaded.startup.name}`,
    description: stanceAlt(side, loaded.startup, loaded.market.pulse),
  };
}

export default function StancePage({ params, searchParams }: PageProps<"/s/[slug]/[side]">) {
  return <StartupView params={params} searchParams={searchParams} />;
}
