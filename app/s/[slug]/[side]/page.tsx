import type { Metadata } from "next";
import { StartupView } from "@/app/s/[slug]/view";
import { loadStartupMarket, pageMeta, stanceBlurb, stanceTitle } from "@/lib/share";
import { isDirection } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/[side]">): Promise<Metadata> {
  const { slug, side } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded || !isDirection(side)) return { title: "not found" };
  return pageMeta({
    title: stanceTitle(side, loaded.startup, loaded.market),
    description: stanceBlurb(side, loaded.market),
  });
}

export default function StancePage({ params, searchParams }: PageProps<"/s/[slug]/[side]">) {
  return <StartupView params={params} searchParams={searchParams} />;
}
