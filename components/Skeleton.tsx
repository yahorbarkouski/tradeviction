import { cx } from "@/lib/cx";

// Placeholders that ship in the static shell where request-bound content
// streams in. Sized like the content they stand in for, so nothing jumps.
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-sm bg-soft", className)} />;
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="pt-1 pb-2">
          <Bone className="h-4 w-3/4" />
          <Bone className="mt-1.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function HeadSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-1 grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3">
        <Bone className="size-10" />
        <div>
          <Bone className="h-5 w-1/2" />
          <Bone className="mt-2 h-4 w-3/4" />
          <Bone className="mt-2 h-3 w-1/4" />
        </div>
      </div>
      <div className="my-5 border-y border-line py-4">
        <Bone className="mb-4 h-3 w-1/4" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Bone className="mb-2 h-3 w-12" />
              <Bone className="h-5 w-10" />
            </div>
          ))}
        </div>
        <Bone className="mt-4 h-4 w-2/3" />
      </div>
    </div>
  );
}

export function PositionSkeleton() {
  return (
    <div className="mb-8" aria-busy="true">
      <Bone className="h-4 w-32" />
      <Bone className="mt-3 h-3 w-40" />
      <div className="mt-3 flex gap-2">
        <Bone className="h-10 w-20" />
        <Bone className="h-10 w-20" />
      </div>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="mt-5" aria-busy="true">
      <ListSkeleton rows={4} />
    </div>
  );
}

export function LineSkeleton() {
  return <Bone className="mt-2 h-4 w-1/2" />;
}
