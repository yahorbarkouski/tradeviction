import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadList } from "@/components/ThreadList";
import { getCurrentUser } from "@/lib/auth";
import { seesDead } from "@/lib/admin";
import { getKarma, listThread } from "@/lib/db/queries";
import { clip, loadThesis, OG_SIZE, thesisAlt } from "@/lib/share";
import { commentPath, findThreadNode } from "@/lib/thread";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const loaded = await loadThesis(slug, id);
  if (!loaded) return { title: "not found" };
  const { comment, startup, pulse } = loaded;
  const side = comment.position?.direction;
  const lead = side ? `${comment.username} ${side} ${startup.name}` : `${comment.username} on ${startup.name}`;
  const image = `/og/thesis/${id}`;
  return {
    title: clip(comment.text, 70),
    description: `${lead} · pulse ${pulse}`,
    openGraph: {
      images: [{ url: image, ...OG_SIZE, alt: thesisAlt(comment, startup, pulse) }],
    },
    twitter: {
      card: "summary_large_image",
      images: [image],
    },
  };
}

export default async function ThesisPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const loaded = await loadThesis(slug, id);
  if (!loaded) notFound();
  const now = nowMs();
  const viewer = await getCurrentUser();
  const thread = await listThread(loaded.startup.id, viewer?.id ?? null, seesDead(viewer), now);
  const node = findThreadNode(thread, id) ?? { ...loaded.comment, kids: [] };
  const href = commentPath(slug, id);
  return (
    <>
      <p className="mb-4 text-sm text-mute">
        <Link href={`/s/${slug}`}>{loaded.startup.name}</Link>
        {" · pulse "}
        {loaded.market.pulse}
        {" · "}
        <Link href={`/s/${slug}`}>all comments</Link>
      </p>
      <ThreadList
        nodes={[node]}
        viewer={viewer}
        now={now}
        href={href}
        slug={slug}
        karma={viewer ? await getKarma(viewer.id, now) : 0}
      />
    </>
  );
}
