import { describe, expect, it } from "vitest";
import { createRng } from "../../src/sim/rng.ts";

describe("rng state persistence", () => {
  it("restoreRng(getState()) resumes the exact same draw sequence", () => {
    const rng = createRng(42);
    // Consume a few draws so we're not just testing the seed itself.
    rng();
    rng();
    rng();

    const state = rng.getState();
    const continued = [rng(), rng(), rng()];

    const resumed = createRng(0); // different seed — state restore should override it entirely
    resumed.restoreRng(state);
    const replayed = [resumed(), resumed(), resumed()];

    expect(replayed).toEqual(continued);
  });

  it("getState() returns a plain uint32, JSON-round-trippable", () => {
    const rng = createRng(1337);
    rng();
    rng();
    const state = rng.getState();

    expect(typeof state).toBe("number");
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBeGreaterThanOrEqual(0);

    const roundTripped = JSON.parse(JSON.stringify({ state })).state;
    expect(roundTripped).toBe(state);

    const restored = createRng(0);
    restored.restoreRng(roundTripped);
    expect(restored()).toBe(rng());
  });

  it("two independently seeded generators produce different sequences until restored to the same state", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());

    b.restoreRng(a.getState());
    expect(a()).toBe(b());
  });
});
