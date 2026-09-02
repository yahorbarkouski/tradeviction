import { describe, expect, it } from "vitest";
import { headline, parseNote } from "@/lib/slug";

describe("headline", () => {
  it("uppercases the first letter and leaves the rest alone", () => {
    expect(headline("shorting nvda, fully")).toBe("Shorting nvda, fully");
    expect(headline("iPhone demand is peaking")).toBe("IPhone demand is peaking");
    expect(headline("NVDA to 200 by Q3")).toBe("NVDA to 200 by Q3");
  });

  it("lowercases a shouted take before capitalizing", () => {
    expect(headline("THIS COMPANY IS COOKED")).toBe("This company is cooked");
    expect(headline("NVDA LONG")).toBe("NVDA LONG");
  });

  it("drops a lone trailing period but keeps paragraph punctuation", () => {
    expect(headline("a first thesis.")).toBe("A first thesis");
    expect(headline("first point. second point.")).toBe("First point. second point.");
    expect(headline("really?")).toBe("Really?");
    expect(headline("wait...")).toBe("Wait...");
  });

  it("collapses whitespace and survives empty and symbol-first input", () => {
    expect(headline("  two   words \n here ")).toBe("Two words here");
    expect(headline("")).toBe("");
    expect(headline("$tsla is done")).toBe("$tsla is done");
  });

  it("is idempotent", () => {
    for (const s of ["shorting nvda.", "THIS IS LOUD", "Already fine", "ok. two."]) {
      expect(headline(headline(s))).toBe(headline(s));
    }
  });

  it("feeds parseNote", () => {
    expect(parseNote("lowercase take.")).toBe("Lowercase take");
    expect(parseNote("x".repeat(501))).toBeNull();
  });
});
