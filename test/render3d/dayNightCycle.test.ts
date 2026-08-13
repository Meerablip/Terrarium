import { describe, expect, it } from "vitest";
import {
  DAY_NIGHT_CYCLE_TICKS,
  moodForTick,
  nightBlendFactorForTick,
} from "../../src/render3d/dayNightCycle.ts";

describe("moodForTick", () => {
  it("reads 'day' for the first half of the cycle", () => {
    expect(moodForTick(0)).toBe("day");
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS / 4)).toBe("day");
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS / 2 - 1)).toBe("day");
  });

  it("reads 'night' for the second half of the cycle", () => {
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS / 2)).toBe("night");
    expect(moodForTick((DAY_NIGHT_CYCLE_TICKS * 3) / 4)).toBe("night");
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS - 1)).toBe("night");
  });

  it("wraps correctly across multiple cycles", () => {
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS)).toBe("day"); // start of cycle 2
    expect(moodForTick(DAY_NIGHT_CYCLE_TICKS * 2 + DAY_NIGHT_CYCLE_TICKS / 2)).toBe("night");
  });

  it("handles a fractional (extrapolated) tick the same as its floor", () => {
    expect(moodForTick(100.7)).toBe(moodForTick(100));
  });
});

describe("nightBlendFactorForTick", () => {
  it("is fully day (0) well before dusk", () => {
    expect(nightBlendFactorForTick(0)).toBe(0);
    expect(nightBlendFactorForTick(DAY_NIGHT_CYCLE_TICKS * 0.1)).toBe(0);
  });

  it("is fully night (1) well after dawn, before the next dusk", () => {
    expect(nightBlendFactorForTick(DAY_NIGHT_CYCLE_TICKS * 0.75)).toBe(1);
  });

  it("ramps smoothly from 0 to 1 across the dusk transition window", () => {
    const half = DAY_NIGHT_CYCLE_TICKS / 2;
    const before = nightBlendFactorForTick(half - 1);
    const mid = nightBlendFactorForTick(half - DAY_NIGHT_CYCLE_TICKS * 0.04); // partway through dusk
    const after = nightBlendFactorForTick(half);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(before);
    expect(after).toBe(1);
  });

  it("ramps smoothly from 1 back to 0 across the dawn transition window, wrapping at the cycle boundary", () => {
    const cycle = DAY_NIGHT_CYCLE_TICKS;
    const justBeforeWrap = nightBlendFactorForTick(cycle - 1);
    const atWrap = nightBlendFactorForTick(cycle); // wraps to phase 0 -> fully day
    expect(justBeforeWrap).toBeGreaterThan(0);
    expect(justBeforeWrap).toBeLessThan(1);
    expect(atWrap).toBe(0);
  });

  it("never returns a value outside [0, 1]", () => {
    for (let t = 0; t < DAY_NIGHT_CYCLE_TICKS; t += DAY_NIGHT_CYCLE_TICKS / 37) {
      const factor = nightBlendFactorForTick(t);
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThanOrEqual(1);
    }
  });

  it("handles negative ticks (defensive — shouldn't occur in practice, but the modulo must not go negative)", () => {
    const factor = nightBlendFactorForTick(-100);
    expect(factor).toBeGreaterThanOrEqual(0);
    expect(factor).toBeLessThanOrEqual(1);
    expect(Number.isNaN(factor)).toBe(false);
  });

  it("is continuous across the cycle wrap (no sudden jump at tick 0/cycle boundary)", () => {
    const justBefore = nightBlendFactorForTick(DAY_NIGHT_CYCLE_TICKS - 0.5);
    const justAfter = nightBlendFactorForTick(0.5);
    // Both should be very close to 0 (deep into the dawn transition,
    // nearly fully day on both sides of the wrap) — no discontinuity.
    expect(Math.abs(justBefore - justAfter)).toBeLessThan(0.01);
  });
});
