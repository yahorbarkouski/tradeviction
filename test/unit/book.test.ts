import { describe, expect, it } from "vitest";
import { changeKind, parseBookChanges, planChanges, type BookChange, type Held } from "@/lib/book";

function held(direction: "long" | "short", conviction: number): Held {
  return { direction, conviction };
}

describe("planning a commit", () => {
  const current = { direction: "long" as const, conviction: 30, note: "Holding" };
  const base = { startupId: "s", from: held("long", 30), close: false };

  it("names each change the way the Book records it", () => {
    expect(changeKind(null, { ...base, from: null, direction: "long", conviction: 5, note: "" })).toBe("open");
    expect(changeKind(current, { ...base, direction: "short", conviction: 30, note: "Holding" })).toBe("flip");
    expect(changeKind(current, { ...base, direction: "long", conviction: 40, note: "Holding" })).toBe("increase");
    expect(changeKind(current, { ...base, direction: "long", conviction: 0, note: "Holding" })).toBe("decrease");
    expect(changeKind(current, { ...base, direction: "long", conviction: 30, note: "New" })).toBe("thesis");
    expect(changeKind(current, { ...base, direction: "long", conviction: 30, note: "Holding" })).toBeNull();
    expect(changeKind(current, { ...base, direction: "long", conviction: 0, note: "", close: true })).toBe("close");
    expect(
      changeKind(null, { ...base, from: null, direction: "long", conviction: 0, note: "", close: true }),
    ).toBeNull();
  });

  it("frees Conviction before spending it and counts the moves", () => {
    const book = new Map([
      ["a", { direction: "long" as const, conviction: 80, note: "" }],
      ["c", { direction: "short" as const, conviction: 10, note: "" }],
    ]);
    const changes: BookChange[] = [
      { startupId: "b", from: null, direction: "long", conviction: 80, note: "", close: false },
      { startupId: "a", from: held("long", 80), direction: "long", conviction: 20, note: "", close: false },
      { startupId: "c", from: held("short", 10), direction: "short", conviction: 0, note: "", close: true },
    ];
    const plan = planChanges(book, changes);
    expect(plan.staged.map((entry) => entry.kind)).toEqual(["close", "decrease", "open"]);
    expect(plan.moves).toBe(1);
    expect(plan.deployed).toBe(100);
  });

  it("parses only well-formed change lists", () => {
    expect(parseBookChanges("[]")).toEqual({ ok: false, error: "Nothing to change." });
    expect(parseBookChanges("{}")).toEqual({ ok: false, error: "Could not read those changes." });
    expect(parseBookChanges("not json").ok).toBe(false);
    const one = { startupId: "s", from: null, direction: "long", conviction: 5, note: "", close: false };
    expect(parseBookChanges(JSON.stringify([one]))).toEqual({ ok: true, changes: [one] });
    expect(parseBookChanges(JSON.stringify([one, one]))).toEqual({ ok: false, error: "One change per company." });
    expect(parseBookChanges(JSON.stringify([{ ...one, from: { direction: "long", conviction: 1.5 } }])).ok).toBe(false);
    expect(parseBookChanges(JSON.stringify([{ ...one, direction: "up" }])).ok).toBe(false);
    expect(parseBookChanges(JSON.stringify([{ ...one, note: 7 }])).ok).toBe(false);
    expect(parseBookChanges(JSON.stringify([{ ...one, close: true }])).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ ...one, startupId: `s${i}` }));
    expect(parseBookChanges(JSON.stringify(many)).ok).toBe(false);
  });
});
