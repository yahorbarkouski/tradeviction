import { describe, expect, it } from "vitest";
import { accounted, loadWorld } from "@/lib/engine";
import { applyBookChange, getMarket, setMuted, setTrusted } from "@/lib/db/queries";
import { ELIGIBLE_AGE_MS, GENESIS_N, GENESIS_WINDOW_MS } from "@/lib/market";
import { DAY_MS } from "@/lib/time";
import { clock, endorse, establish, makeStartup, makeUser, plainComment, vote } from "./harness/factories";

describe("accounted", () => {
  it("needs seven days, three startups, and an endorsement, or trust, or a checkmark; muting removes it", async () => {
    clock.freeze();
    const fresh = await makeUser();
    const established = await makeUser();
    await establish(established);
    const oldNarrow = await makeUser();
    await establish(oldNarrow, { touches: 2 });
    const youngWide = await makeUser();
    await establish(youngWide, { ageMs: ELIGIBLE_AGE_MS - 60_000 });
    const unendorsed = await makeUser();
    await establish(unendorsed, { endorse: false });
    const trusted = await makeUser({ trusted: true });
    const verified = await makeUser({ verified: true });
    const mutedEstablished = await makeUser({ muted: true });
    await establish(mutedEstablished);

    const world = await loadWorld(Date.now());
    const now = Date.now();
    expect(accounted(world, fresh.id, now)).toBe(false);
    expect(accounted(world, established.id, now)).toBe(true);
    expect(accounted(world, oldNarrow.id, now)).toBe(false);
    expect(accounted(world, youngWide.id, now)).toBe(false);
    expect(accounted(world, unendorsed.id, now)).toBe(false);
    expect(accounted(world, trusted.id, now)).toBe(true);
    expect(accounted(world, verified.id, now)).toBe(true);
    expect(accounted(world, mutedEstablished.id, now)).toBe(false);
    expect(accounted(world, "nobody", now)).toBe(false);
  });

  it("counts comments as touches", async () => {
    clock.freeze();
    const user = await makeUser({ createdAt: Date.now() - 8 * DAY_MS });
    const comments: string[] = [];
    for (let i = 0; i < 3; i += 1) comments.push(await plainComment(user, await makeStartup(), `touch ${i}`));
    expect(accounted(await loadWorld(Date.now()), user.id, Date.now())).toBe(false);
    await endorse(comments[0] ?? "");
    expect(accounted(await loadWorld(Date.now()), user.id, Date.now())).toBe(true);
  });

  it("takes an endorsement only from a trusted or verified member who is not muted", async () => {
    clock.freeze();
    const user = await makeUser();
    await establish(user, { endorse: false });
    const take = await plainComment(user, await makeStartup(), "waiting for an endorsement");
    const isAccounted = async () => accounted(await loadWorld(Date.now()), user.id, Date.now());

    await vote(await makeUser(), take);
    expect(await isAccounted()).toBe(false);
    const aged = await makeUser();
    await establish(aged);
    await vote(aged, take);
    expect(await isAccounted()).toBe(false);
    const mutedTrusted = await makeUser({ trusted: true, muted: true });
    await vote(mutedTrusted, take);
    expect(await isAccounted()).toBe(false);
    await vote(await makeUser({ verified: true }), take);
    expect(await isAccounted()).toBe(true);
  });

  it("does not let a farm endorse itself, however long it waits", async () => {
    clock.freeze();
    const socks = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const sock of socks) await establish(sock, { endorse: false });
    const takes: string[] = [];
    for (const sock of socks) takes.push(await plainComment(sock, await makeStartup(), "sock take"));
    for (let i = 0; i < socks.length; i += 1) {
      for (let j = 0; j < socks.length; j += 1) {
        if (i !== j) await vote(socks[i], takes[j]);
      }
    }
    clock.advance(90 * DAY_MS);
    const world = await loadWorld(Date.now());
    for (const sock of socks) expect(accounted(world, sock.id, Date.now())).toBe(false);
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
