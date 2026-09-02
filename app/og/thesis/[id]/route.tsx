import { HomeOg, ThesisOg, avatarSrc, faviconSrc, ogImage } from "@/lib/og";
import { getCommentById } from "@/lib/db/comments";
import { getMarket } from "@/lib/db/markets";
import { getStartupById } from "@/lib/db/startups";
import { getUserById } from "@/lib/db/users";
import { thesisPulse } from "@/lib/share";
import { nowMs } from "@/lib/time";
import { xAvatarUrl } from "@/lib/x";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comment = await getCommentById(id);
  if (!comment) return ogImage(<HomeOg />);
  const startup = await getStartupById(comment.startupId);
  if (!startup) return ogImage(<HomeOg />);
  const now = nowMs();
  const [market, author] = await Promise.all([getMarket(startup.id, now), getUserById(comment.userId)]);
  const [icon, avatar] = await Promise.all([
    faviconSrc(startup.domain),
    author?.xAvatar ? avatarSrc(xAvatarUrl(author.xAvatar)) : Promise.resolve(null),
  ]);
  return ogImage(
    <ThesisOg
      startup={startup}
      text={comment.text}
      username={comment.username}
      pulse={await thesisPulse(comment, market.pulse, now)}
      side={comment.position?.direction ?? null}
      icon={icon}
      avatar={avatar}
    />,
  );
}
