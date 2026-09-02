import { HomeOg, ProfileOg, OG_SIZE, OG_TYPE, avatarSrc, bookIcons, ogImage } from "@/lib/og";
import { alphaRank } from "@/lib/db/scores";
import { loadProfileBook } from "@/lib/share";
import { nowMs } from "@/lib/time";
import { xAvatarUrl } from "@/lib/x";

export const alt = "Tradeviction book";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const loaded = await loadProfileBook(username);
  if (!loaded) return ogImage(<HomeOg />);
  const [avatar, rank, icons] = await Promise.all([
    loaded.user.xAvatar ? avatarSrc(xAvatarUrl(loaded.user.xAvatar)) : Promise.resolve(null),
    alphaRank(loaded.user.id, nowMs()),
    bookIcons(loaded.lines),
  ]);
  return ogImage(
    <ProfileOg
      username={loaded.user.username}
      alpha={loaded.stats.alpha}
      lines={loaded.lines}
      avatar={avatar}
      rank={rank}
      icons={icons}
    />,
  );
}
