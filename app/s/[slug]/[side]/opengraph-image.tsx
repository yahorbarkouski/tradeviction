import { HomeOg, StartupOg, OG_SIZE, OG_TYPE, faviconSrc, ogImage } from "@/lib/og";
import { loadStartupMarket } from "@/lib/share";
import { isDirection } from "@/lib/types";

export const alt = "Tradeviction";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; side: string }>;
}) {
  const { slug, side } = await params;
  const loaded = await loadStartupMarket(slug);
  if (!loaded || !isDirection(side)) return ogImage(<HomeOg />);
  const icon = await faviconSrc(loaded.startup.domain);
  return ogImage(
    <StartupOg startup={loaded.startup} market={loaded.market} intent={side} icon={icon} />,
  );
}
