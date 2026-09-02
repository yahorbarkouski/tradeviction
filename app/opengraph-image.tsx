import { HomeOg, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";

export const alt = "Long or short a startup. Put it in a book.";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image() {
  return ogImage(<HomeOg />);
}
