import { HomeOg, ProfileOg, OG_SIZE, OG_TYPE, ogImage } from "@/lib/og";
import { loadProfileBook } from "@/lib/share";

export const alt = "Tradeviction book";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const loaded = await loadProfileBook(username);
  if (!loaded) return ogImage(<HomeOg />);
  return ogImage(
    <ProfileOg username={loaded.user.username} alpha={loaded.stats.alpha} lines={loaded.lines} />,
  );
}
