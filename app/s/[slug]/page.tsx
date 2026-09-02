import type { Metadata } from "next";
import { StartupView } from "@/app/s/[slug]/view";
import { loadStartupMarket, marketBlurb, marketTitle, pageMeta } from "@/lib/share";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded) return { title: "not found" };
  const { startup, market } = loaded;
  return pageMeta({ title: marketTitle(startup, market), description: marketBlurb(market) });
}

export default function StartupPage({ params, searchParams }: PageProps<"/s/[slug]">) {
  return <StartupView params={params} searchParams={searchParams} />;
}
