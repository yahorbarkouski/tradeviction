import { CONVICTION_CAP } from "@/lib/market";
import { isDirection, type Direction, type EventKind } from "@/lib/types";

// A commit from the Book editor: several position changes that land together
// or not at all. Each change carries what the editor believed the Book held,
// so a page left open in another tab cannot overwrite a newer change.

export const BATCH_MAX = 50;

export const STALE_BOOK = "Your Book changed since this page loaded. Reload and try again.";

export type Held = { direction: Direction; conviction: number };

export type HeldNote = Held & { note: string };

export type BookChange = {
  startupId: string;
  // The open position the editor showed, or null for a startup it did not hold.
  from: Held | null;
  direction: Direction;
  conviction: number;
  note: string;
  close: boolean;
};

export type ParsedChanges = { ok: true; changes: BookChange[] } | { ok: false; error: string };

export type Staged = { change: BookChange; kind: EventKind };

export type Plan = {
  // Every change that does something, in the order it must be applied.
  staged: Staged[];
  moves: number;
  // Conviction across the whole Book once the plan has landed.
  deployed: number;
};

const UNREADABLE = "Could not read those changes.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isConviction(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= CONVICTION_CAP;
}

// undefined means the field was malformed; null means "not held".
function parseHeld(value: unknown): Held | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { direction, conviction } = value;
  if (typeof direction !== "string" || !isDirection(direction)) return undefined;
  if (!isConviction(conviction)) return undefined;
  return { direction, conviction };
}

function parseChange(value: unknown): BookChange | null {
  if (!isRecord(value)) return null;
  const { startupId, direction, conviction, note, close } = value;
  if (typeof startupId !== "string" || startupId.length === 0 || startupId.length > 64) return null;
  const from = parseHeld(value.from);
  if (from === undefined) return null;
  if (typeof close !== "boolean") return null;
  if (close && from === null) return null;
  if (typeof direction !== "string" || !isDirection(direction)) return null;
  if (!isConviction(conviction)) return null;
  if (typeof note !== "string") return null;
  return { startupId, from, direction, conviction, note, close };
}

export function parseBookChanges(raw: string): ParsedChanges {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  if (!Array.isArray(body)) return { ok: false, error: UNREADABLE };
  if (body.length === 0) return { ok: false, error: "Nothing to change." };
  if (body.length > BATCH_MAX) return { ok: false, error: `Commit at most ${BATCH_MAX} changes at once.` };
  const changes: BookChange[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    const change = parseChange(item);
    if (!change) return { ok: false, error: UNREADABLE };
    if (seen.has(change.startupId)) return { ok: false, error: "One change per company." };
    seen.add(change.startupId);
    changes.push(change);
  }
  return { ok: true, changes };
}

export function sameHeld(a: Held | null, b: Held | null): boolean {
  if (a === null || b === null) return a === b;
  return a.direction === b.direction && a.conviction === b.conviction;
}

// What a change does to the position held now, or null when it changes nothing.
// Mirrors the branches applyBookChange takes, so a plan never stages a write
// the database would refuse as "Nothing to change."
export function changeKind(current: HeldNote | null, change: BookChange): EventKind | null {
  if (change.close) return current ? "close" : null;
  if (!current) return "open";
  if (current.direction !== change.direction) return "flip";
  if (current.conviction !== change.conviction) {
    return change.conviction > current.conviction ? "increase" : "decrease";
  }
  if (current.note !== change.note) return "thesis";
  return null;
}

export function spendsMove(kind: EventKind): boolean {
  return kind === "open" || kind === "flip" || kind === "increase";
}

// Conviction is freed before it is spent, so a commit that moves Conviction
// from one position to another never trips the cap midway.
const PHASE: Record<EventKind, number> = {
  close: 0,
  decrease: 1,
  thesis: 2,
  flip: 3,
  increase: 4,
  open: 5,
};

export function byPhase(a: EventKind, b: EventKind): number {
  return PHASE[a] - PHASE[b];
}

export function planChanges(current: ReadonlyMap<string, HeldNote>, changes: readonly BookChange[]): Plan {
  let deployed = 0;
  for (const held of current.values()) deployed += held.conviction;
  let moves = 0;
  const staged: Staged[] = [];
  for (const change of changes) {
    const held = current.get(change.startupId) ?? null;
    const kind = changeKind(held, change);
    if (!kind) continue;
    if (spendsMove(kind)) moves += 1;
    deployed += (kind === "close" ? 0 : change.conviction) - (held?.conviction ?? 0);
    staged.push({ change, kind });
  }
  staged.sort((a, b) => byPhase(a.kind, b.kind));
  return { staged, moves, deployed };
}
