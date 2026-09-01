import { HomeOg, ThesisOg, faviconSrc, ogImage } from "@/lib/og";
import { getCommentById, getMarket, getStartupById } from "@/lib/db/queries";
import { thesisPulse } from "@/lib/share";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comment = await getCommentById(id);
  if (!comment) return ogImage(<HomeOg />);
  const startup = await getStartupById(comment.startupId);
  if (!startup) return ogImage(<HomeOg />);
  const market = await getMarket(startup.id, nowMs());
  const icon = await faviconSrc(startup.domain);
  return ogImage(
    <ThesisOg
      startup={startup}
      text={comment.text}
      username={comment.username}
      pulse={await thesisPulse(comment, market.pulse)}
      side={comment.position?.direction ?? null}
      icon={icon}
    />,
  );
}
