import { HomeOg, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "Bet your beliefs before they become common knowledge.";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image() {
  return ogImage(<HomeOg />);
}
