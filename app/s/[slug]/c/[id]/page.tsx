import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompanyHead } from "@/components/CompanyHead";
import { MarketBoard } from "@/components/MarketBoard";
import { MarksProvider } from "@/components/Marks";
import { HeadSkeleton, ThreadSkeleton } from "@/components/Skeleton";
import { ThreadList } from "@/components/ThreadList";
import { loadThesis, pageMeta, takeBlurb, takeTitle, takeXTitle, thesisAlt } from "@/lib/share";
import { commentPath, findThreadNode } from "@/lib/thread";
import { cachedNow } from "@/lib/clock";
import { getViewerMarks } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/c/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const loaded = await loadThesis(slug, id);
  if (!loaded) return { title: "not found" };
  const { comment, startup, pulse } = loaded;
  return pageMeta({
    title: takeTitle(comment),
    xTitle: takeXTitle(comment, startup),
    description: takeBlurb(comment, startup, pulse),
    image: { url: `/og/thesis/${id}`, alt: thesisAlt(comment, startup, pulse) },
  });
}

export default function ThesisPage({ params }: PageProps<"/s/[slug]/c/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <HeadSkeleton />
          <ThreadSkeleton />
        </>
      }
    >
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
      <CompanyHead startup={loaded.startup} link />
      <MarketBoard startupId={loaded.startup.id} slug={slug} />
      <p className="mb-4 text-sm text-mute">
        <Link href={`/s/${slug}`}>all comments</Link>
      </p>
      <MarksProvider marks={getViewerMarks()}>
        <ThreadList nodes={[node]} now={await cachedNow()} href={href} slug={slug} />
      </MarksProvider>
    </>
  );
}
