import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarksProvider } from "@/components/Marks";
import { ThreadSkeleton } from "@/components/Skeleton";
import { ThreadList } from "@/components/ThreadList";
import { clip, loadThesis, OG_SIZE, thesisAlt } from "@/lib/share";
import { commentPath, findThreadNode } from "@/lib/thread";
import { cachedNow } from "@/lib/clock";
import { getViewerMarks } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/c/[id]">): Promise<Metadata> {
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

export default function ThesisPage({ params }: PageProps<"/s/[slug]/c/[id]">) {
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <ThesisBody params={params} />
    </Suspense>
  );
}

async function ThesisBody({ params }: Pick<PageProps<"/s/[slug]/c/[id]">, "params">) {
  const { slug, id } = await params;
  const loaded = await loadThesis(slug, id);
  if (!loaded) notFound();
  const node = findThreadNode(loaded.thread, id) ?? { ...loaded.comment, kids: [] };
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
      <MarksProvider marks={getViewerMarks()}>
        <ThreadList nodes={[node]} now={await cachedNow()} href={href} slug={slug} />
      </MarksProvider>
    </>
  );
}
