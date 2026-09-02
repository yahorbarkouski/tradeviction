import { HomeOg, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";
import { partyImage } from "@/lib/og-party";
import { getPartyByCode } from "@/lib/db/parties";
import { isInviteCode } from "@/lib/party";

export const alt = "Join a Tradeviction party";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const party = isInviteCode(code) ? await getPartyByCode(code) : null;
  if (!party) return ogImage(<HomeOg />);
  return partyImage(party);
}
