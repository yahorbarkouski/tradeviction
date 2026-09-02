"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { rebalanceAction } from "@/app/actions/book";
import type { ActionState } from "@/app/actions/lib";
import { Favicon } from "@/components/Favicon";
import { Honeypot } from "@/components/Honeypot";
import { LineStats } from "@/components/LineStats";
import { MetricValue } from "@/components/Metric";
import { byPhase, changeKind, spendsMove, type BookChange, type HeldNote } from "@/lib/book";
import { cx } from "@/lib/cx";
import { stanceTone, stanceWord } from "@/lib/format";
import { CONVICTION_CAP, MOVES_PER_DAY } from "@/lib/market";
import { NOTE_MAX } from "@/lib/validate";
import { area, btn, ghost, input, kicker, pipe, tap } from "@/lib/ui";
import { isLookupHit, type BookLine, type Direction, type EventKind, type StartupPick } from "@/lib/types";

// The owner's whole Book as one form. Every position is a row with live
// controls; edits stage locally and one Commit sends them together.

type Pick = Omit<StartupPick, "pulse"> & { pulse: number | null };

type Row = {
  startup: Pick;
  line: BookLine | null;
  // What the Book held when the page loaded; null for a row added here.
  held: HeldNote | null;
  direction: Direction;
  raw: string;
  note: string;
  closed: boolean;
  editing: boolean;
};

type Entry = { row: Row; change: BookChange; kind: EventKind };

const NEW_ROW_CONVICTION = 10;

// No bg-transparent here: it would outrank the bg-long fill of the chosen side.
const chip = `inline-flex min-h-9 items-center border px-2.5 py-1 font-sans text-sm leading-none ${tap} hover:no-underline`;

const qtyField = "h-9 w-14 border bg-transparent px-2 text-center font-mono text-base tabular-nums";

const PLACEHOLDER: Record<Direction, string> = {
  long: "Founder has found a distribution loop nobody seems to understand yet.",
  short: "Strong product, but my interactions with the founder changed my view of execution risk.",
};

function rowsFrom(lines: BookLine[]): Row[] {
  return lines.map((line) => ({
    startup: {
      id: line.startup.id,
      slug: line.startup.slug,
      name: line.startup.name,
      domain: line.startup.domain,
      pulse: line.pulse,
    },
    line,
    held: { direction: line.position.direction, conviction: line.position.conviction, note: line.position.note },
    direction: line.position.direction,
    raw: String(line.position.conviction),
    note: line.position.note,
    closed: false,
    editing: false,
  }));
}

function parseConviction(raw: string): number {
  if (raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? Math.min(CONVICTION_CAP, n) : 0;
}

function changeOf(row: Row): BookChange {
  return {
    startupId: row.startup.id,
    from: row.held ? { direction: row.held.direction, conviction: row.held.conviction } : null,
    direction: row.direction,
    conviction: row.closed ? 0 : parseConviction(row.raw),
    note: row.closed ? "" : row.note,
    close: row.closed,
  };
}

function entriesOf(rows: Row[]): Entry[] {
  const entries: Entry[] = [];
  for (const row of rows) {
    const change = changeOf(row);
    const kind = changeKind(row.held, change);
    if (kind) entries.push({ row, change, kind });
  }
  return entries.sort((a, b) => byPhase(a.kind, b.kind));
}

function usedBy(rows: Row[]): number {
  return rows.reduce((sum, row) => sum + (row.closed ? 0 : parseConviction(row.raw)), 0);
}

function inTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function BookEditor({
  lines,
  movesLeft,
  picks,
}: {
  lines: BookLine[];
  movesLeft: number;
  picks: StartupPick[];
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(lines));
  const [state, action, pending] = useActionState(rebalanceAction, null as ActionState);

  const entries = entriesOf(rows);
  const used = usedBy(rows);
  const moves = entries.filter((entry) => spendsMove(entry.kind)).length;
  const longTake = rows.some((row) => !row.closed && row.note.trim().length > NOTE_MAX);
  const blocker =
    used > CONVICTION_CAP
      ? `${used - CONVICTION_CAP} over the ${CONVICTION_CAP} cap`
      : moves > movesLeft
        ? `needs ${moves} moves, ${movesLeft} left today`
        : longTake
          ? `a take is over ${NOTE_MAX} characters`
          : null;
  const inBook = new Set(rows.map((row) => row.startup.id));
  const ready = entries.length > 0 && blocker === null && !pending;
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" anywhere on the page jumps to the search box.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (inTextField(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Cmd or Ctrl+Enter commits from any field. A plain Enter in a text field
  // must not, since that would submit the whole Book by accident.
  function onFormKey(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key !== "Enter") return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      if (ready) event.currentTarget.requestSubmit();
      return;
    }
    if (event.target instanceof HTMLInputElement) event.preventDefault();
  }

  function update(id: string, patch: Partial<Row>): void {
    setRows((prev) => prev.map((row) => (row.startup.id === id ? { ...row, ...patch } : row)));
  }

  function add(pick: Pick, direction: Direction): void {
    setRows((prev) => {
      if (prev.some((row) => row.startup.id === pick.id)) {
        return prev.map((row) => (row.startup.id === pick.id ? { ...row, closed: false, direction } : row));
      }
      const free = CONVICTION_CAP - usedBy(prev);
      const row: Row = {
        startup: pick,
        line: null,
        held: null,
        direction,
        raw: String(Math.max(0, Math.min(NEW_ROW_CONVICTION, free))),
        note: "",
        closed: false,
        editing: false,
      };
      return [row, ...prev];
    });
  }

  // A held position is marked to close and its edits dropped; a row added
  // here just goes.
  function remove(id: string): void {
    setRows((prev) =>
      prev.flatMap((row) => {
        if (row.startup.id !== id) return [row];
        if (!row.held) return [];
        return [
          {
            ...row,
            closed: true,
            editing: false,
            direction: row.held.direction,
            raw: String(row.held.conviction),
            note: row.held.note,
          },
        ];
      }),
    );
  }

  return (
    <form action={action} onKeyDown={onFormKey} aria-busy={pending} className={cx(pending && "opacity-60")}>
      <Honeypot />
      <input type="hidden" name="changes" value={JSON.stringify(entries.map((entry) => entry.change))} />
      <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0">
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className={cx(kicker, "m-0")}>Book</h2>
          <span className="text-sm text-mute tabular-nums">
            {movesLeft}/{MOVES_PER_DAY} moves today
          </span>
        </div>
        <Allocation rows={rows} used={used} />
        <AddBox
          picks={picks.filter((pick) => !inBook.has(pick.id))}
          inline={rows.length === 0}
          inputRef={searchRef}
          onAdd={add}
        />
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-mute">
            Nothing in your Book yet. Pick a side on a company to open a position. You have {CONVICTION_CAP} Conviction
            to spread and {MOVES_PER_DAY} moves a day; cutting and closing are always free.
          </p>
        ) : (
          <ul className="m-0 mt-3 list-none p-0">
            {rows.map((row) => (
              <EditorRow
                key={row.startup.id}
                row={row}
                changed={changeKind(row.held, changeOf(row)) !== null}
                onChange={(patch) => update(row.startup.id, patch)}
                onRemove={() => remove(row.startup.id)}
              />
            ))}
          </ul>
        )}
        {entries.length > 0 ? <Changes entries={entries} /> : null}
        <div className={cx("sticky bottom-0 border-t border-line bg-bg py-3", entries.length === 0 && "hidden")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="submit" className={btn} disabled={!ready} title="⌘ Enter">
              {pending ? "Committing" : `Commit ${entries.length} ${entries.length === 1 ? "change" : "changes"}`}
            </button>
            <button type="button" className={ghost} onClick={() => setRows(rowsFrom(lines))}>
              discard
            </button>
            <span className={cx("text-sm tabular-nums sm:ml-auto", blocker ? "text-short" : "text-mute")}>
              {blocker ??
                `${moves} ${moves === 1 ? "move" : "moves"} · ${movesLeft - moves} left after · ${used}/${CONVICTION_CAP}`}
            </span>
          </div>
          {state?.error ? <p className="mt-2 mb-0 text-sm text-short">{state.error}</p> : null}
        </div>
      </fieldset>
    </form>
  );
}

// How the hundred is spread: one segment per active position, in row order.
function Allocation({ rows, used }: { rows: Row[]; used: number }) {
  const live = rows.filter((row) => !row.closed && parseConviction(row.raw) > 0);
  const long = live.filter((row) => row.direction === "long").reduce((sum, row) => sum + parseConviction(row.raw), 0);
  const short = used - long;
  const free = CONVICTION_CAP - used;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 w-full gap-px overflow-hidden bg-soft" aria-hidden="true">
        {live.map((row) => (
          <span
            key={row.startup.id}
            className={cx("h-full shrink-0", row.direction === "long" ? "bg-long" : "bg-short")}
            style={{ width: `${parseConviction(row.raw)}%` }}
            title={`${row.startup.name} · ${row.direction} ${parseConviction(row.raw)}`}
          />
        ))}
      </div>
      <p className="mt-1.5 mb-0 flex flex-wrap items-center justify-between gap-x-3 font-mono text-sm tabular-nums">
        <span>
          <span className="text-long">{long} long</span>
          <span className="text-mute"> · </span>
          <span className="text-short">{short} short</span>
          <span className="text-mute"> · </span>
          <span className={free < 0 ? "text-short" : "text-mute"}>{free < 0 ? `${-free} over` : `${free} free`}</span>
        </span>
        <MetricValue id="conviction" className={free < 0 ? "text-short" : "text-ink"}>
          {used}/{CONVICTION_CAP}
        </MetricValue>
      </p>
    </div>
  );
}

function EditorRow({
  row,
  changed,
  onChange,
  onRemove,
}: {
  row: Row;
  changed: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { startup, line, held } = row;
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-1.5 gap-y-1.5 py-1.5 md:grid-cols-[1.25rem_minmax(0,1fr)_auto]">
      <Favicon domain={startup.domain} name={startup.name} size={20} />
      <div className={cx("min-w-0", row.closed && "opacity-50")}>
        <div className={cx(row.closed && "line-through")}>
          <Link href={`/s/${startup.slug}`}>{startup.name}</Link>
          {!line ? <span className="ml-1.5 font-mono text-sm text-mute">NEW</span> : null}
        </div>
        <div className="text-sm text-mute">{line ? <LineStats line={line} /> : startup.domain}</div>
        <Take row={row} onChange={onChange} />
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-3">
        {row.closed ? (
          <span className="text-sm text-mute">
            closing ·{" "}
            <button type="button" className={pipe} onClick={() => onChange({ closed: false })}>
              undo
            </button>
          </span>
        ) : (
          <>
            <Side side="long" on={row.direction === "long"} onClick={() => onChange({ direction: "long" })} />
            <Side side="short" on={row.direction === "short"} onClick={() => onChange({ direction: "short" })} />
            <input
              className={cx(qtyField, changed ? "border-ink" : "border-line")}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={3}
              placeholder="0"
              value={row.raw}
              autoFocus={!line}
              aria-label={`Conviction on ${startup.name}`}
              onChange={(event) => onChange({ raw: event.target.value.replace(/\D/g, "") })}
              onBlur={() => onChange({ raw: String(parseConviction(row.raw)) })}
              onKeyDown={(event) => {
                if (event.metaKey || event.ctrlKey || event.altKey) return;
                if (event.key === "l" || event.key === "s") {
                  event.preventDefault();
                  onChange({ direction: event.key === "l" ? "long" : "short" });
                  return;
                }
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const delta = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
                onChange({ raw: String(Math.max(0, Math.min(CONVICTION_CAP, parseConviction(row.raw) + delta))) });
              }}
            />
            <button type="button" className={cx(pipe, "ml-1")} onClick={onRemove}>
              {held ? "close" : "remove"}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Take({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  if (row.closed) return null;
  if (row.editing) {
    const n = row.note.trim().length;
    return (
      <div className="mt-1.5">
        <textarea
          className={area}
          value={row.note}
          placeholder={PLACEHOLDER[row.direction]}
          aria-label={`Take on ${row.startup.name}`}
          autoFocus
          onChange={(event) => onChange({ note: event.target.value })}
        />
        <div className="mt-1 text-sm text-mute tabular-nums">
          <span className={n > NOTE_MAX ? "text-short" : undefined}>
            {n}/{NOTE_MAX}
          </span>
          {" · "}
          <button type="button" className={pipe} onClick={() => onChange({ editing: false })}>
            done
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5">
      {row.note ? <p className="m-0 text-pretty">{row.note}</p> : null}
      <button type="button" className={pipe} onClick={() => onChange({ editing: true })}>
        {row.note ? "edit take" : "add a take"}
      </button>
    </div>
  );
}

function Side({ side, on, onClick }: { side: Direction; on: boolean; onClick: () => void }) {
  const tone = side === "long" ? "border-long text-long" : "border-short text-short";
  const fill = side === "long" ? "bg-long text-bg" : "bg-short text-bg";
  return (
    <button type="button" className={cx(chip, on ? fill : tone)} onClick={onClick} aria-pressed={on}>
      [ {side} ]
    </button>
  );
}

function Changes({ entries }: { entries: Entry[] }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className={cx(kicker, "mb-1")}>Changes</div>
      <ul className="m-0 list-none p-0 text-sm">
        {entries.map((entry) => (
          <li key={entry.row.startup.id} className="flex justify-between gap-x-3 py-0.5">
            <span>
              <ChangeText entry={entry} />
            </span>
            <span className="shrink-0 text-mute tabular-nums">{spendsMove(entry.kind) ? "1 move" : "free"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeText({ entry }: { entry: Entry }) {
  const { row, change, kind } = entry;
  const name = row.startup.name;
  const side = <span className={stanceTone(change.direction)}>{stanceWord(change.direction)}</span>;
  const offPulse = change.conviction < 1 ? ", off Pulse" : "";
  if (kind === "open") {
    return (
      <>
        open {side} {name} · {change.conviction}
        {offPulse}
      </>
    );
  }
  if (kind === "flip") {
    return (
      <>
        flip {name} to {side} · {change.conviction}
        {offPulse}
      </>
    );
  }
  if (kind === "close") return <>close {name}</>;
  if (kind === "thesis") return <>rewrite take · {name}</>;
  return (
    <>
      {name} · {row.held?.conviction ?? 0} → {change.conviction}
      {kind === "decrease" ? offPulse : ""}
    </>
  );
}

// Search box over the catalog. With nothing typed it offers the hottest
// boards, in a dropdown for a Book with rows and inline for an empty one.
function AddBox({
  picks,
  inline,
  inputRef,
  onAdd,
}: {
  picks: Pick[];
  inline: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onAdd: (pick: Pick, side: Direction) => void;
}) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: Pick[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/lookup?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((res) => res.json())
        .then((body: unknown) => {
          if (typeof body === "object" && body !== null && "hits" in body && Array.isArray(body.hits)) {
            setResult({ q: term, hits: body.hits.filter(isLookupHit).map((hit) => ({ ...hit, pulse: null })) });
          }
        })
        .catch(() => {
          return;
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const term = q.trim();
  const searching = term.length >= 2;
  const hits = searching && result?.q === term ? result.hits : [];
  const items = searching ? hits : inline ? [] : picks.slice(0, 6);
  const show = open && items.length > 0;
  const nothing = searching && open && result?.q === term && hits.length === 0;

  function choose(pick: Pick, side: Direction): void {
    onAdd(pick, side);
    setQ("");
    setResult(null);
    setOpen(false);
    setActive(0);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((n) => Math.min(items.length - 1, n + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((n) => Math.max(0, n - 1));
    } else if (event.key === "Enter") {
      // Cmd or Ctrl+Enter bubbles up to commit the Book.
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      const pick = items[active];
      if (show && pick) choose(pick, event.shiftKey ? "short" : "long");
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      className="relative mt-4"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        className={cx(input, "max-w-none")}
        placeholder="add a company…"
        value={q}
        autoComplete="off"
        role="combobox"
        aria-label="Add a company to your Book"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          setQ(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {show ? (
        // Pressing inside the list must not blur the input, or the click never lands.
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 z-10 m-0 mt-1 max-h-96 list-none overflow-auto border border-line bg-[#f3f3f3] p-0"
          onPointerDown={(event) => event.preventDefault()}
        >
          {!searching ? <li className={cx(kicker, "px-3 pt-2 text-sm")}>hot right now</li> : null}
          {items.map((pick, i) => (
            <PickRow
              key={pick.id}
              pick={pick}
              active={i === active}
              onHover={() => setActive(i)}
              onPick={(side) => choose(pick, side)}
            />
          ))}
        </ul>
      ) : null}
      {nothing ? (
        <p className="mt-1.5 mb-0 text-sm text-mute">
          Nothing listed for “{term}”. <Link href="/submit">Submit it</Link>.
        </p>
      ) : null}
      {inline && picks.length > 0 ? (
        <div className="mt-4">
          <div className={cx(kicker, "mb-1")}>hot right now</div>
          <ul className="m-0 list-none p-0">
            {picks.slice(0, 6).map((pick) => (
              <PickRow key={pick.id} pick={pick} active={false} flush onPick={(side) => choose(pick, side)} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PickRow({
  pick,
  active,
  flush = false,
  onHover,
  onPick,
}: {
  pick: Pick;
  active: boolean;
  // Inline rows sit on the page's left edge; dropdown rows get an inset.
  flush?: boolean;
  onHover?: () => void;
  onPick: (side: Direction) => void;
}) {
  return (
    <li
      role="option"
      aria-selected={active}
      className={cx("flex items-center gap-2 py-2", !flush && "px-3", active && "bg-[#e6e6e6]")}
      onMouseEnter={onHover}
    >
      <Favicon domain={pick.domain} name={pick.name} size={20} />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{pick.name}</span>
        <span className="text-sm text-mute"> {pick.domain}</span>
        {pick.pulse !== null ? (
          <span className="ml-1.5 font-mono text-sm text-mute tabular-nums">pulse {pick.pulse}</span>
        ) : null}
      </span>
      <Side side="long" on={false} onClick={() => onPick("long")} />
      <Side side="short" on={false} onClick={() => onPick("short")} />
    </li>
  );
}
