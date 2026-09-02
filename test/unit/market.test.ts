import { describe, expect, it } from "vitest";
import {
  CARRY_RHO,
  EVEN_PRIOR,
  GENESIS_N,
  GENESIS_WINDOW_MS,
  HOTNESS_BREAKOUT,
  OPENING_WEIGHT,
  QUIET_MIN_DAYS,
  carryCost,
  clampP,
  discover,
  discoveryAlpha,
  earlyness,
  firstSeen,
  genesisAt,
  heatAt,
  lastOpenP,
  logit,
  openingPrior,
  phaseOf,
  priceAlpha,
  pulseDisplay,
  pulseP,
  quietStreakDays,
  scoreLot,
  tallyAt,
  utcDay,
  utcDayStart,
  type Slice,
  type Touch,
} from "@/lib/market";
import { DAY_MS } from "@/lib/time";

const HOUR = 3_600_000;
const everyone = () => true;
const DAY0 = utcDayStart(Date.UTC(2026, 5, 1));

function slice(userId: string, direction: "long" | "short", openedAt: number, closedAt: number | null = null): Slice {
  return { userId, direction, openedAt, closedAt };
}

function holders(n: number, direction: "long" | "short", openedAt: number): Slice[] {
  return Array.from({ length: n }, (_, i) => slice(`u${i}`, direction, openedAt));
}

function touches(n: number, at: number, prefix = "n"): Touch[] {
  return Array.from({ length: n }, (_, i) => ({ userId: `${prefix}${i}`, at }));
}

describe("pulse", () => {
  it("starts even and moves with each holder", () => {
    expect(pulseP(0, 0)).toBe(0.5);
    expect(pulseP(3, 1)).toBe(0.625);
    expect(pulseDisplay(pulseP(3, 1))).toBe(63);
  });

  it("opens at a catalog line that fades as real votes arrive", () => {
    const prior = openingPrior(80);
    expect(prior).toEqual({ p: 0.8, weight: OPENING_WEIGHT });
    expect(pulseP(0, 0, prior)).toBe(0.8);
    expect(pulseP(0, 1, prior)).toBeCloseTo(8 / 11);
    expect(openingPrior(null)).toBe(EVEN_PRIOR);
  });

  it("clamps away from the edges before taking a logit", () => {
    expect(clampP(0)).toBe(0.01);
    expect(clampP(1)).toBe(0.99);
    expect(clampP(Number.NaN)).toBe(0.5);
    expect(logit(0.5)).toBe(0);
    expect(logit(0.75)).toBeCloseTo(Math.log(3));
  });
});

describe("tallyAt", () => {
  const slices = [slice("a", "long", 0), slice("a", "long", 5), slice("b", "short", 10), slice("c", "long", 20, 30)];

  it("counts each holder once, as of the moment asked", () => {
    expect(tallyAt(slices, 15, everyone)).toEqual({ long: 1, short: 1, n: 2, p: 0.5 });
    expect(tallyAt(slices, 25, everyone).n).toBe(3);
    expect(tallyAt(slices, 30, everyone).n).toBe(2);
  });

  it("leaves out the viewer and anyone not accounted", () => {
    expect(tallyAt(slices, 25, everyone, "c").n).toBe(2);
    expect(tallyAt(slices, 25, (id) => id !== "b").short).toBe(0);
  });
});

describe("genesis", () => {
  it("forms until twenty holders hold through the window, then opens", () => {
    expect(genesisAt(holders(GENESIS_N - 1, "long", DAY0), everyone, DAY0 + 2 * GENESIS_WINDOW_MS)).toEqual({
      kind: "forming",
    });
    const twenty = holders(GENESIS_N, "long", DAY0);
    expect(genesisAt(twenty, everyone, DAY0 + 1)).toEqual({
      kind: "window",
      startedAt: DAY0,
      endsAt: DAY0 + GENESIS_WINDOW_MS,
    });
    const open = genesisAt(twenty, everyone, DAY0 + GENESIS_WINDOW_MS + 1);
    expect(open.kind).toBe("open");
    if (open.kind === "open") {
      expect(open.at).toBe(DAY0 + GENESIS_WINDOW_MS);
      expect(open.p).toBeCloseTo(22 / 24);
    }
  });

  it("starts over when a holder leaves before the window closes", () => {
    const twenty = holders(GENESIS_N, "long", DAY0).map((s, i) => (i === 0 ? { ...s, closedAt: DAY0 + DAY_MS } : s));
    expect(genesisAt(twenty, everyone, DAY0 + GENESIS_WINDOW_MS + 1)).toEqual({ kind: "forming" });
  });
});

describe("lastOpenP", () => {
  const slices = holders(10, "long", 0).map((s, i) => (i < 5 ? { ...s, closedAt: 100 } : s));

  it("is live while ten holders are in and frozen at the last such moment after", () => {
    expect(lastOpenP(slices, everyone, 50)).toEqual({ p: pulseP(10, 0), frozen: false });
    expect(lastOpenP(slices, everyone, 200)).toEqual({ p: pulseP(10, 0), frozen: true });
  });
});

describe("alpha", () => {
  it("prices a lot by the move in logit since entry, signed by side", () => {
    expect(priceAlpha(10, "long", 0.5, 0.75)).toBeCloseTo(10 * Math.log(3));
    expect(priceAlpha(10, "short", 0.5, 0.75)).toBeCloseTo(-10 * Math.log(3));
    expect(priceAlpha(10, "long", 0.5, 0.5)).toBe(0);
  });

  it("pays discovery for days held while quiet, on the side the board confirmed", () => {
    expect(earlyness(0)).toBe(0);
    expect(earlyness(7)).toBeCloseTo(Math.log(2));
    expect(earlyness(10_000)).toBe(earlyness(365));
    const paid = 30 * (2 * 0.71 - 1) * Math.log(3);
    expect(discoveryAlpha({ conviction: 30, direction: "long", holdDays: 14, pStar: 0.71 })).toBeCloseTo(paid);
    expect(discoveryAlpha({ conviction: 30, direction: "short", holdDays: 14, pStar: 0.71 })).toBeCloseTo(-paid);
  });

  it("charges carry per whole day held", () => {
    expect(CARRY_RHO).toBe(0.002);
    expect(carryCost(50, 0, 3 * DAY_MS)).toBeCloseTo(0.3);
    expect(carryCost(50, 0, DAY_MS - 1)).toBe(0);
  });

  it("scores only carry before genesis and everything after", () => {
    const lot = {
      conviction: 10,
      direction: "long" as const,
      openedAt: 0,
      closedAt: null,
      storedEntryP: 0.6,
      now: 2 * DAY_MS,
      nowP: 0.75,
      genesisP: 0.5,
      discovery: null,
      pStar: 0.5,
    };
    const forming = scoreLot({ ...lot, genesis: { kind: "forming" } });
    expect(forming.price).toBe(0);
    expect(forming.discovery).toBe(0);
    expect(forming.carry).toBeCloseTo(0.04);
    expect(forming.total).toBeCloseTo(-0.04);

    // Opened before genesis: priced from the Pulse at genesis, not the stored entry.
    const genesis = { kind: "open" as const, at: DAY_MS, p: 0.5 };
    const early = scoreLot({ ...lot, genesis });
    expect(early.price).toBeCloseTo(10 * Math.log(3));
    expect(early.total).toBeCloseTo(10 * Math.log(3) - 0.04);

    // Opened after genesis: priced from its own entry.
    const late = scoreLot({ ...lot, genesis, openedAt: 2 * DAY_MS, now: 3 * DAY_MS });
    expect(late.price).toBeCloseTo(10 * (logit(0.75) - logit(0.6)));
  });
});

describe("hotness", () => {
  const now = DAY0 + 12 * HOUR;

  it("is zero on an untouched board", () => {
    expect(heatAt([], new Map(), now, everyone).hotness).toBe(0);
  });

  it("rises with a burst of newcomers against a quiet baseline", () => {
    const burst = touches(10, now - HOUR);
    const ten = heatAt(burst, firstSeen(burst), now, everyone);
    expect(ten).toMatchObject({ actors: 10, baseline: 0, fresh: 1 });
    expect(ten.hotness).toBeCloseTo(100 * (1 - Math.exp(-(Math.log(3) * Math.log(3)) / 2.5)), 5);
    const bigger = touches(40, now - HOUR);
    expect(heatAt(bigger, firstSeen(bigger), now, everyone).hotness).toBeGreaterThan(HOTNESS_BREAKOUT);
  });

  it("only counts actors who are still in the market", () => {
    const burst = touches(10, now - HOUR);
    expect(heatAt(burst, firstSeen(burst), now, everyone, () => false).actors).toBe(0);
  });

  it("stays cool when the crowd is the usual crowd", () => {
    const daily: Touch[] = [];
    for (let d = 0; d < 40; d += 1) daily.push(...touches(10, now - d * DAY_MS - HOUR, "regular"));
    const heat = heatAt(daily, firstSeen(daily), now, everyone);
    expect(heat).toMatchObject({ actors: 10, baseline: 10, fresh: 0, hotness: 0 });
  });
});

describe("quiet", () => {
  const origin = DAY0 - 20 * DAY_MS;
  const now = DAY0 + 2 * HOUR;

  it("counts quiet days back from today until one had five actors", () => {
    expect(quietStreakDays([], origin, now, everyone)).toBe(21);
    expect(quietStreakDays(touches(5, DAY0 + HOUR), origin, now, everyone)).toBe(0);
  });

  it("names the phase", () => {
    expect(phaseOf({ genesis: { kind: "forming" }, quietDays: 3, hot: false })).toBe("forming");
    expect(phaseOf({ genesis: { kind: "forming" }, quietDays: QUIET_MIN_DAYS, hot: false })).toBe("quiet");
    expect(phaseOf({ genesis: { kind: "open", at: 0, p: 0.5 }, quietDays: 0, hot: false })).toBe("active");
    expect(phaseOf({ genesis: { kind: "open", at: 0, p: 0.5 }, quietDays: 0, hot: true })).toBe("hot");
  });

  it("confirms a discovery once a long quiet stretch heats up", () => {
    const heatDay = origin + 20 * DAY_MS;
    const crowd = touches(30, heatDay + HOUR);
    const slices = holders(30, "long", heatDay + HOUR);
    expect(discover(slices, crowd, origin, heatDay - DAY_MS, everyone)).toBeNull();

    const found = discover(slices, crowd, origin, heatDay + 2 * DAY_MS, everyone);
    expect(found).not.toBeNull();
    expect(found?.confirmed).toBe(true);
    expect(found?.quietStart).toBe(utcDayStart(origin));
    expect(found?.quietDays).toBeCloseTo(21, 5);
    expect(found?.windowActors).toBe(30);
    expect(found?.pStar).toBeCloseTo(32 / 34);
  });

  it("pays nothing for a board that heated up before it was ever quiet", () => {
    const early = touches(30, origin + 3 * DAY_MS);
    expect(discover([], early, origin, origin + 30 * DAY_MS, everyone)).toBeNull();
  });
});

describe("utc days", () => {
  it("names and starts the day in UTC", () => {
    expect(utcDay(Date.UTC(2026, 0, 2, 23, 59))).toBe("2026-01-02");
    expect(utcDayStart(Date.UTC(2026, 0, 2, 23, 59))).toBe(Date.UTC(2026, 0, 2));
  });
});
