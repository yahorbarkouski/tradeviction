import type { ThreadNode } from "@/lib/types";

export const THREAD_PAGE = 10;
export const THREAD_SIDES = ["all", "long", "short"] as const;
export const THREAD_SORTS = ["popular", "new"] as const;

export type ThreadSide = (typeof THREAD_SIDES)[number];
export type ThreadSort = (typeof THREAD_SORTS)[number];

const SIDE_SET: ReadonlySet<string> = new Set(THREAD_SIDES);
const SORT_SET: ReadonlySet<string> = new Set(THREAD_SORTS);

export function isThreadSide(value: string): value is ThreadSide {
  return SIDE_SET.has(value);
}

export function isThreadSort(value: string): value is ThreadSort {
  return SORT_SET.has(value);
}

export function threadHref(slug: string, side: ThreadSide, sort: ThreadSort): string {
  const params = new URLSearchParams();
  if (side !== "all") params.set("side", side);
  if (sort !== "popular") params.set("sort", sort);
  const query = params.toString();
  return query ? `/s/${slug}?${query}` : `/s/${slug}`;
}

export function commentPath(slug: string, id: string): string {
  return `/s/${slug}/c/${id}`;
}

export function findThreadNode(nodes: ThreadNode[], id: string): ThreadNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findThreadNode(node.kids, id);
    if (hit) return hit;
  }
  return null;
}

export function filterThread(nodes: ThreadNode[], side: ThreadSide): ThreadNode[] {
  if (side === "all") return nodes;
  return nodes.filter((node) => node.position?.direction === side);
}

export function sortThread(nodes: ThreadNode[], sort: ThreadSort): ThreadNode[] {
  const copy = [...nodes];
  if (sort === "new") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
    return copy;
  }
  copy.sort((a, b) => b.score - a.score || b.points - a.points || b.createdAt - a.createdAt);
  return copy;
}
