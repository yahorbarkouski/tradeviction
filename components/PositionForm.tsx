"use client";

import Link from "next/link";
import { useActionState, useOptimistic, useState } from "react";
import { bookAction, type ActionState } from "@/app/actions";
import { Honeypot } from "@/components/Honeypot";
import { MetricLabel } from "@/components/Metric";
import { CONVICTION_CAP, MOVES_PER_DAY } from "@/lib/game";
import { formatAlpha, stanceTone, stanceWord } from "@/lib/format";
import { NOTE_MAX } from "@/lib/slug";
import { cx } from "@/lib/cx";
import { area, btn, closeBtn, field, kicker, label, metric, qty, stance } from "@/lib/ui";
import { isDirection, type BookLine, type Direction, type Position } from "@/lib/types";

// What the viewer just asked for, shown until the server's re-render lands.
type PendingChange = {
  direction: Direction;
  conviction: number;
  close: boolean;
};

function pendingFrom(formData: FormData): PendingChange {
  const direction = String(formData.get("direction") ?? "");
  const conviction = Number(formData.get("conviction") ?? 0);
  return {
    direction: isDirection(direction) ? direction : "long",
    conviction: Number.isFinite(conviction) ? conviction : 0,
    close: formData.get("close") === "1",
  };
}

export function PositionForm({
  startupId,
  line,
  deployed,
  movesRemaining,
  username,
  preset = null,
  next,
}: {
  startupId: string;
  line: BookLine | null;
  deployed: number;
  movesRemaining: number;
  username: string;
  preset?: Direction | null;
  // Set on the /long and /short entry pages, which land on the startup page after a save.
  next?: string;
}) {
  const current = line?.position ?? null;
  const [direction, setDirection] = useState<Direction | null>(preset ?? current?.direction ?? null);
  const [convictionRaw, setConvictionRaw] = useState(
    current !== null ? String(current.conviction) : "",
  );
  const [note, setNote] = useState(current?.note ?? "");
  const conviction = parseConviction(convictionRaw);
  const [pendingChange, setPendingChange] = useOptimistic<PendingChange | null>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    setPendingChange(pendingFrom(formData));
    return bookAction(prev, formData);
  }, null as ActionState);
  const room = CONVICTION_CAP - deployed + (current?.conviction ?? 0);
  const ready = direction !== null && note.trim().length <= NOTE_MAX && conviction <= room;
  const thesisOnly =
    current !== null && direction === current.direction && conviction === current.conviction;
  const reducing =
    current !== null && direction === current.direction && conviction < current.conviction;
  const flipping = current !== null && direction !== null && direction !== current.direction;
  const spendsMove =
    !thesisOnly && !reducing && (current === null || flipping || conviction > current.conviction);

  return (
    <section className="mb-8" id="position" aria-busy={pendingChange !== null}>
      {line ? (
        <HeldPosition line={line} action={action} pending={pending} pendingChange={pendingChange} />
      ) : pendingChange ? (
        <div className={cx(kicker, "opacity-60")}>
          Opening <span className={stanceTone(pendingChange.direction)}>{stanceWord(pendingChange.direction)}</span>{" "}
          {pendingChange.conviction}
        </div>
      ) : (
        <div className={kicker}>Open a position</div>
      )}
      <div className={line ? "mt-5 border-t border-line pt-4" : "mt-3"}>
        {line ? <div className={cx(kicker, "mb-3")}>Change</div> : null}
        <p className="mb-3 text-sm text-mute tabular-nums">
          <Link href={`/u/${username}`}>
            <MetricLabel id="conviction">
              {deployed}/{CONVICTION_CAP}
            </MetricLabel>
          </Link>
          {" · "}
          {movesRemaining}/{MOVES_PER_DAY} moves today
        </p>
        <form action={action}>
          <Honeypot />
          <input type="hidden" name="startupId" value={startupId} />
          <input type="hidden" name="direction" value={direction ?? ""} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className="flex gap-2">
            <StanceButton side="long" on={direction === "long"} onClick={() => setDirection("long")} />
            <StanceButton side="short" on={direction === "short"} onClick={() => setDirection("short")} />
          </div>
          {direction ? (
            <>
              <label className={field} htmlFor="conviction">
                <MetricLabel id="conviction">Conviction</MetricLabel>
                {" · "}
                {room} free
              </label>
              <input type="hidden" name="conviction" value={conviction} />
              <input
                className={qty}
                id="conviction"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                maxLength={3}
                placeholder="0"
                value={convictionRaw}
                onChange={(e) => setConvictionRaw(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  if (convictionRaw === "") return;
                  setConvictionRaw(String(parseConviction(convictionRaw)));
                }}
              />
              <label className={field} htmlFor="note">
                Take
              </label>
              <textarea
                className={area}
                id="note"
                name="note"
                value={note}
                maxLength={NOTE_MAX}
                placeholder={
                  direction === "long"
                    ? "Founder has found a distribution loop nobody seems to understand yet."
                    : "Strong product, but my interactions with the founder changed my view of execution risk."
                }
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-1 text-sm text-mute tabular-nums">{note.trim().length}/{NOTE_MAX}</div>
              {state?.error ? <p className="mt-2 text-short">{state.error}</p> : null}
              <button
                className={`mt-3.5 ${btn}`}
                type="submit"
                disabled={!ready || pending || (spendsMove && movesRemaining <= 0)}
              >
                {pending ? "Saving" : commitLabel(current, direction, conviction)}
              </button>
              <p className="mt-2 text-sm text-mute">
                {changeHint(
                  current,
                  direction,
                  conviction,
                  spendsMove,
                  reducing,
                  thesisOnly,
                  movesRemaining,
                )}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-mute">
              Pick <span className="text-long">long</span> or <span className="text-short">short</span>.
              Opening spends a move. Closing later is free. 0 Conviction stays on
              the Book, out of Pulse.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function HeldPosition({
  line,
  action,
  pending,
  pendingChange,
}: {
  line: BookLine;
  action: (formData: FormData) => void | Promise<void>;
  pending: boolean;
  pendingChange: PendingChange | null;
}) {
  const { position } = line;
  const shown =
    pendingChange && !pendingChange.close
      ? { ...position, direction: pendingChange.direction, conviction: pendingChange.conviction }
      : position;
  const word = stanceWord(shown.direction);
  const tone = stanceTone(shown.direction);
  const active = shown.conviction >= 1;
  return (
    <div className={cx(pendingChange && "opacity-60")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className={kicker}>{pendingChange?.close ? "Closing your position" : "Your position"}</div>
        <ClosePositionForm
          startupId={position.startupId}
          direction={position.direction}
          conviction={position.conviction}
          action={action}
          pending={pending}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <div className={cx(label, "mb-2")}>side</div>
          <div className={cx(metric, tone)}>{word}</div>
          <div className="mt-1 font-mono text-sm tabular-nums text-mute">
            {active ? `${shown.conviction} · in Pulse` : "inactive · off Pulse"}
          </div>
        </div>
        <div>
          <div className={cx(label, "mb-2")}>entry</div>
          <div className={metric}>{line.entryPulse}</div>
          {line.entryDepth > 0 ? (
            <div className="mt-1 font-mono text-sm tabular-nums text-mute">d{line.entryDepth}</div>
          ) : null}
        </div>
        <div>
          <div className={cx(label, "mb-2")}>now</div>
          <div className={metric}>{line.pulse}</div>
          {line.daysEarly !== null ? (
            <div className="mt-1 font-mono text-sm tabular-nums text-mute">{line.daysEarly}d early</div>
          ) : null}
        </div>
        <div>
          <div className={cx(label, "mb-2")}>
            <MetricLabel id="alpha">alpha</MetricLabel>
          </div>
          <div className={cx(metric, line.liveAlpha >= 0 ? "text-long" : "text-short")}>
            {formatAlpha(line.liveAlpha)}
          </div>
          {line.discoveryAlpha !== 0 ? (
            <div className="mt-1 font-mono text-sm tabular-nums text-mute">
              disc {formatAlpha(line.discoveryAlpha)}
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-sm text-mute">
        {pendingChange
          ? "Saving."
          : active
            ? `Close ${word} ${position.conviction}. Locks ${formatAlpha(line.liveAlpha)} Alpha, returns ${position.conviction} Conviction. Drops you from Pulse. Free.`
            : `Close inactive ${word}. Leaves the Book. Free.`}
      </p>
    </div>
  );
}

export function ClosePositionForm({
  startupId,
  direction,
  conviction,
  next,
  action,
  pending = false,
}: {
  startupId: string;
  direction: Direction;
  conviction: number;
  next?: string;
  action: (formData: FormData) => void | Promise<void>;
  pending?: boolean;
}) {
  const word = stanceWord(direction);
  return (
    <form action={action}>
      <Honeypot />
      <input type="hidden" name="startupId" value={startupId} />
      <input type="hidden" name="close" value="1" />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="conviction" value="0" />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        className={closeBtn}
        disabled={pending}
        aria-label={conviction >= 1 ? `Close ${word} ${conviction}` : `Close inactive ${word}`}
      >
        [ CLOSE ]
      </button>
    </form>
  );
}

function parseConviction(raw: string): number {
  if (raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function commitLabel(current: Position | null, direction: Direction, conviction: number): string {
  const next = `${stanceWord(direction)} ${conviction}`;
  if (!current) {
    if (conviction < 1) return `Open ${stanceWord(direction)} 0, stay off Pulse`;
    return `Open ${next}`;
  }
  if (direction !== current.direction) {
    return `Close ${stanceWord(current.direction)}, open ${next}`;
  }
  if (conviction === current.conviction) return "Change take";
  if (conviction === 0) return "Reduce to 0, leave Pulse";
  if (conviction > current.conviction) return `Add Conviction · ${current.conviction} → ${conviction}`;
  return `Reduce · ${current.conviction} → ${conviction}`;
}

function changeHint(
  current: Position | null,
  direction: Direction,
  conviction: number,
  spendsMove: boolean,
  reducing: boolean,
  thesisOnly: boolean,
  movesRemaining: number,
): string {
  if (spendsMove && movesRemaining <= 0) return "No moves left today.";
  if (!current) {
    return conviction < 1
      ? "Spends 1 move. You stay off Pulse until Conviction is at least 1."
      : "Spends 1 move. Close later is free.";
  }
  if (direction !== current.direction) {
    return `Spends 1 move. Closes ${stanceWord(current.direction)} first.`;
  }
  if (thesisOnly) return "Free.";
  if (reducing && conviction === 0) return "Free. Stays on the Book as inactive. Leaves Pulse.";
  if (reducing) return "Free.";
  return "Spends 1 move.";
}

function StanceButton({
  side,
  on,
  onClick,
}: {
  side: Direction;
  on: boolean;
  onClick: () => void;
}) {
  const tone = side === "long" ? "text-long border-long" : "text-short border-short";
  const fill = side === "long" ? "bg-long text-bg" : "bg-short text-bg";
  return (
    <button type="button" className={cx(stance, on ? fill : tone)} onClick={onClick}>
      [ {side} ]
    </button>
  );
}

export function StanceLinks({ slug, preset = null }: { slug: string; preset?: Direction | null }) {
  return (
    <section className="mb-8" id="position">
      <div className={kicker}>Open a position</div>
      <p className="mt-2 mb-3 text-sm text-mute">
        Login to pick a side. Opening spends a move. Closing later is free.
      </p>
      <div className="flex gap-2">
        <Link
          href={`/login?next=/s/${slug}/long`}
          className={cx(
            stance,
            "hover:no-underline",
            preset === "long" ? "bg-long text-bg" : "border-long text-long",
          )}
        >
          [ long ]
        </Link>
        <Link
          href={`/login?next=/s/${slug}/short`}
          className={cx(
            stance,
            "hover:no-underline",
            preset === "short" ? "bg-short text-bg" : "border-short text-short",
          )}
        >
          [ short ]
        </Link>
      </div>
    </section>
  );
}
