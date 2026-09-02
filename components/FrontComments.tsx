import Link from "next/link";
import { FrontCommentRow } from "@/components/FrontCommentRow";
import { MarksProvider } from "@/components/Marks";
import { FRONT_PAGE } from "@/lib/db/queries";
import type { FrontComment } from "@/lib/types";
import type { ViewerMarks } from "@/lib/marks";

export function FrontComments({
  items,
  page,
  total,
  now,
  marks,
}: {
  items: FrontComment[];
  page: number;
  total: number;
  now: number;
  marks: Promise<ViewerMarks | null>;
}) {
  if (items.length === 0) {
    return <p className="text-mute">No comments yet.</p>;
  }
  const more = page * FRONT_PAGE < total;
  const start = (page - 1) * FRONT_PAGE;
  return (
    <MarksProvider marks={marks}>
      <ol className="m-0 list-none p-0">
        {items.map((item, i) => (
          <li key={item.id}>
            <FrontCommentRow rank={start + i + 1} item={item} now={now} />
          </li>
        ))}
      </ol>
      {more ? (
        <p className="mt-3 grid grid-cols-[2.5ch_1rem_minmax(0,1fr)] gap-x-1.5 text-sm">
          <span />
          <span />
          <Link href={`/?p=${page + 1}`} prefetch={true}>
            More
          </Link>
        </p>
      ) : null}
    </MarksProvider>
  );
}
