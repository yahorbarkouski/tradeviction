import { formatAlpha } from "@/lib/format";
import type { BookLine } from "@/lib/types";

// Entry Pulse to now, live Alpha, and how early the position was.
export function LineStats({ line }: { line: BookLine }) {
  return (
    <>
      {line.entryPulse}→{line.pulse}
      {line.entryDepth > 0 ? ` · d${line.entryDepth}` : ""}
      {" · "}
      <span className={line.liveAlpha >= 0 ? "text-long" : "text-short"}>{formatAlpha(line.liveAlpha)}</span>
      {line.discoveryAlpha !== 0 ? <span className="text-mute"> · disc {formatAlpha(line.discoveryAlpha)}</span> : null}
      {line.daysEarly !== null ? <span className="text-mute"> · {line.daysEarly}d early</span> : null}
    </>
  );
}
