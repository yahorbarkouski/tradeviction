import Link from "next/link";
import { FrontCommentRow } from "@/components/FrontCommentRow";
import { FRONT_PAGE } from "@/lib/db/queries";
import type { FrontComment, User } from "@/lib/types";

export function FrontComments({
  items,
  page,
  total,
  viewer,
  now,
  karma,
}: {
  items: FrontComment[];
  page: number;
  total: number;
  viewer: User | null;
  now: number;
  karma: number;
}) {
  if (items.length === 0) {
    return <p className="text-mute">No comments yet.</p>;
  }
  const more = page * FRONT_PAGE < total;
  const start = (page - 1) * FRONT_PAGE;
  return (
    <>
      <ol className="m-0 list-none p-0">
        {items.map((item, i) => (
          <li key={item.id}>
            <FrontCommentRow rank={start + i + 1} item={item} viewer={viewer} now={now} karma={karma} />
          </li>
        ))}
      </ol>
      {more ? (
        <p className="mt-3 grid grid-cols-[2.5ch_1rem_minmax(0,1fr)] gap-x-1.5 text-sm">
          <span />
          <span />
          <Link href={`/?p=${page + 1}`}>More</Link>
        </p>
      ) : null}
    </>
  );
}
