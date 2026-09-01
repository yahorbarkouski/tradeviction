import { describe, expect, it } from "vitest";
import { accounted, loadWorld } from "@/lib/engine";
import { applyBookChange, getMarket, setMuted, setTrusted } from "@/lib/db/queries";
import { ELIGIBLE_AGE_MS, GENESIS_N, GENESIS_WINDOW_MS } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { clock, establish, makeStartup, makeUser, plainComment } from "./harness/factories";

describe("accounted", () => {
  it("needs seven days and three startups, or trust, and muting removes it", async () => {
    clock.freeze();
    const fresh = await makeUser();
    const established = await makeUser();
    await establish(established);
    const oldNarrow = await makeUser();
    await establish(oldNarrow, { touches: 2 });
    const youngWide = await makeUser();
    await establish(youngWide, { ageMs: ELIGIBLE_AGE_MS - 60_000 });
    const trusted = await makeUser({ trusted: true });
    const mutedEstablished = await makeUser({ muted: true });
    await establish(mutedEstablished);

    const world = await loadWorld(Date.now());
    const now = Date.now();
    expect(accounted(world, fresh.id, now)).toBe(false);
    expect(accounted(world, established.id, now)).toBe(true);
    expect(accounted(world, oldNarrow.id, now)).toBe(false);
    expect(accounted(world, youngWide.id, now)).toBe(false);
    expect(accounted(world, trusted.id, now)).toBe(true);
    expect(accounted(world, mutedEstablished.id, now)).toBe(false);
    expect(accounted(world, "nobody", now)).toBe(false);
  });

  it("counts comments as touches", async () => {
    clock.freeze();
    const user = await makeUser({ createdAt: Date.now() - 8 * DAY_MS });
    for (let i = 0; i < 3; i += 1) await plainComment(user, await makeStartup(), `touch ${i}`);
    const world = await loadWorld(Date.now());
    expect(accounted(world, user.id, Date.now())).toBe(true);
  });

  it("is evaluated at a point in time", async () => {
    clock.freeze();
    const user = await makeUser();
    await establish(user);
    const world = await loadWorld(Date.now());
    expect(accounted(world, user.id, Date.now())).toBe(true);
    expect(accounted(world, user.id, user.createdAt + DAY_MS)).toBe(false);
  });
});

describe("pulse and depth", () => {
  it("counts only accounted holders in pulse and depth, but everyone in the conviction split", async () => {
    const startup = await makeStartup();
    const trusted = await makeUser({ trusted: true });
    const fresh = await makeUser();
    const muted = await makeUser({ muted: true });
    await applyBookChange({ startupId: startup.id, userId: trusted.id, direction: "long", conviction: 10, note: "" });
    await applyBookChange({ startupId: startup.id, userId: fresh.id, direction: "short", conviction: 30, note: "" });
    await applyBookChange({ startupId: startup.id, userId: muted.id, direction: "short", conviction: 20, note: "" });

    const market = await getMarket(startup.id);
    expect(market.depth).toBe(1);
    expect(market.publicLong).toBe(1);
    expect(market.publicShort).toBe(0);
    expect(market.pulse).toBe(60);
    expect(market.convLong).toBe(10);
    expect(market.convShort).toBe(50);
    expect(market.convLongPct).toBe(17);
    expect(market.forming).toBe(true);
  });

  it("counts a holder the moment they are trusted and drops them when muted", async () => {
    const startup = await makeStartup();
    const fresh = await makeUser();
    await applyBookChange({ startupId: startup.id, userId: fresh.id, direction: "long", conviction: 10, note: "" });
    expect((await getMarket(startup.id)).depth).toBe(0);
    await setTrusted(fresh.id, true);
    expect((await getMarket(startup.id)).depth).toBe(1);
    await setMuted(fresh.id, true);
    expect((await getMarket(startup.id)).depth).toBe(0);
  });

  it("opens the market once twenty accounted holders hold through the genesis window", async () => {
    clock.freeze();
    const startup = await makeStartup();
    for (let i = 0; i < GENESIS_N; i += 1) {
      const holder = await makeUser({ trusted: true });
      await applyBookChange({
        startupId: startup.id,
        userId: holder.id,
        direction: i % 4 === 0 ? "short" : "long",
        conviction: 5,
        note: "",
      });
    }
    let market = await getMarket(startup.id);
    expect(market.depth).toBe(GENESIS_N);
    expect(market.forming).toBe(true);

    clock.advance(GENESIS_WINDOW_MS + 1);
    market = await getMarket(startup.id);
    expect(market.forming).toBe(false);
    expect(market.depth).toBe(GENESIS_N);
    expect(market.pulse).toBe(71);
  });

  it("stays forming with nineteen holders", async () => {
    clock.freeze();
    const startup = await makeStartup();
    for (let i = 0; i < GENESIS_N - 1; i += 1) {
      const holder = await makeUser({ trusted: true });
      await applyBookChange({ startupId: startup.id, userId: holder.id, direction: "long", conviction: 5, note: "" });
    }
    clock.advance(GENESIS_WINDOW_MS + 1);
    expect((await getMarket(startup.id)).forming).toBe(true);
  });
});
