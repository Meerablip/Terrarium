import { describe, expect, it } from "vitest";
import { blendedDayNightPalette, lerpPalette } from "../../src/render3d/world/paletteBlend.ts";
import { paletteForMood } from "../../src/render3d/world/palette.ts";

const day = paletteForMood("day");
const night = paletteForMood("night");

describe("lerpPalette", () => {
  it("returns (a copy of) the first palette at t=0", () => {
    const result = lerpPalette(day, night, 0);
    expect(result.grassLight).toBe(day.grassLight);
    expect(result.skyTop).toBe(day.skyTop);
    expect(result.ambientIntensity).toBeCloseTo(day.ambientIntensity, 6);
  });

  it("returns (a copy of) the second palette at t=1", () => {
    const result = lerpPalette(day, night, 1);
    expect(result.grassLight).toBe(night.grassLight);
    expect(result.skyTop).toBe(night.skyTop);
    expect(result.ambientIntensity).toBeCloseTo(night.ambientIntensity, 6);
  });

  it("produces a genuinely intermediate hex color at t=0.5, not either endpoint", () => {
    const result = lerpPalette(day, night, 0.5);
    expect(result.skyTop).not.toBe(day.skyTop);
    expect(result.skyTop).not.toBe(night.skyTop);
    expect(result.skyTop).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("lerps numeric fields linearly", () => {
    const result = lerpPalette(day, night, 0.5);
    const expected = (day.ambientIntensity + night.ambientIntensity) / 2;
    expect(result.ambientIntensity).toBeCloseTo(expected, 4);
  });

  it("clamps t outside [0, 1] rather than extrapolating", () => {
    const belowZero = lerpPalette(day, night, -0.5);
    const aboveOne = lerpPalette(day, night, 1.5);
    expect(belowZero.skyTop).toBe(day.skyTop);
    expect(aboveOne.skyTop).toBe(night.skyTop);
  });

  it("lerps the flowers array element-by-element", () => {
    const result = lerpPalette(day, night, 0.5);
    expect(result.flowers).toHaveLength(day.flowers.length);
    for (const [i, color] of result.flowers.entries()) {
      expect(color).not.toBe(day.flowers[i]);
      expect(color).not.toBe(night.flowers[i]);
    }
  });

  it("keeps windowWarm constant across the blend (day and night share the same value)", () => {
    // Both GHIBLI_DAY and GHIBLI_NIGHT intentionally use the same
    // windowWarm color (the lit-window payoff stays warm at any time of
    // day) — confirm the lerp doesn't accidentally perturb an identical
    // input pair.
    expect(day.windowWarm).toBe(night.windowWarm);
    const result = lerpPalette(day, night, 0.37);
    expect(result.windowWarm).toBe(day.windowWarm);
  });

  it("snaps mood and labelBg at the halfway point rather than producing an invalid intermediate value", () => {
    const justBelowHalf = lerpPalette(day, night, 0.49);
    const justAboveHalf = lerpPalette(day, night, 0.51);
    expect(justBelowHalf.mood).toBe("day");
    expect(justAboveHalf.mood).toBe("night");
    expect(justBelowHalf.labelBg).toBe(day.labelBg);
    expect(justAboveHalf.labelBg).toBe(night.labelBg);
  });
});

describe("blendedDayNightPalette", () => {
  it("matches lerpPalette(day, night, factor) for the standard palette pair", () => {
    const viaConvenience = blendedDayNightPalette(0.3);
    const viaDirect = lerpPalette(day, night, 0.3);
    expect(viaConvenience).toEqual(viaDirect);
  });

  it("returns exactly the day palette at factor 0 and night palette at factor 1", () => {
    expect(blendedDayNightPalette(0).grassLight).toBe(day.grassLight);
    expect(blendedDayNightPalette(1).grassLight).toBe(night.grassLight);
  });
});
