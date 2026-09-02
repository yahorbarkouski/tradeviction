import { HomeOg, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";
import { partyImage } from "@/lib/og-party";
import { cachedPartyBySlug } from "@/lib/db/parties";

export const alt = "Tradeviction party";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const party = await cachedPartyBySlug(slug);
  if (!party) return ogImage(<HomeOg />);
  return partyImage(party);
}
