// Generic per-field lerp between two WorldPalette objects — powers the
// day/night smooth transition (dayNightCycle.ts's nightBlendFactorForTick
// drives `t` here every frame, per the implementation plan's "smooth blend
// across a transition window, not a hard cut" design). Pure, dependency-
// free (no three.js Color import — string-hex math via ./color.ts) so it's
// cheap to unit-test without a WebGL context, same reasoning as
// dayNightCycle.ts and steering.ts.

import { lerp, lerpHexColor } from "./color.ts";
import { paletteForMood, type WorldPalette } from "./palette.ts";

// Non-color scalar fields — lerped numerically, not as hex.
const NUMERIC_FIELDS = ["fogDensity", "hemiIntensity", "sunIntensity", "ambientIntensity"] as const;

// String-hex color fields — lerped channel-by-channel via lerpHexColor.
// (mood and flowers are handled separately: mood isn't a color, flowers is
// an array of colors, not a single one.)
const COLOR_FIELDS = [
  "ink",
  "skyTop",
  "skyHorizon",
  "fog",
  "hemiSky",
  "hemiGround",
  "sunColor",
  "ambient",
  "cloud",
  "cloudShadow",
  "sunGlow",
  "water",
  "waterDeep",
  "waterShallow",
  "waveLine",
  "foam",
  "grassLight",
  "grass",
  "grassDark",
  "cliff",
  "cliffDark",
  "sand",
  "pathDirt",
  "plaza",
  "trunk",
  "trunkDark",
  "canopyLight",
  "canopy",
  "canopyDark",
  "pine",
  "bush",
  "rock",
  "rockDark",
  "crop",
  "fieldSoil",
  "wallLight",
  "wall",
  "wallShadow",
  "roof",
  "roofRidge",
  "beam",
  "door",
  "window",
  "windowWarm",
  "foundation",
  "beacon",
  "focusFlag",
  "trail",
  "labelText",
] as const;

/**
 * Lerps every color/numeric field of `a` toward `b` by `t` (0 = a, 1 = b).
 * `mood` on the result is whichever side `t` is closer to (a boolean-ish
 * field has no meaningful "halfway" value — callers needing the smooth
 * value should use `t` itself, e.g. dayNightCycle.ts's blend factor, not
 * the returned palette's `.mood`). `flowers` (a color array, used for
 * scattered nature — not yet rendered by anything in Phases 1-4) is lerped
 * element-by-element assuming both palettes have the same length, which
 * GHIBLI_DAY/GHIBLI_NIGHT do. `labelBg` (an rgba() CSS string, not a plain
 * hex) is snapped rather than lerped — see the field-by-field note below.
 */
export function lerpPalette(a: WorldPalette, b: WorldPalette, t: number): WorldPalette {
  const clampedT = Math.max(0, Math.min(1, t));
  const result = { ...a } as WorldPalette;

  for (const field of COLOR_FIELDS) {
    result[field] = lerpHexColor(a[field], b[field], clampedT);
  }
  for (const field of NUMERIC_FIELDS) {
    result[field] = lerp(a[field], b[field], clampedT);
  }

  result.flowers = a.flowers.map((color, i) => lerpHexColor(color, b.flowers[i] ?? color, clampedT));

  // labelBg is an rgba() CSS string (DOM label background), not a hex
  // color lerpHexColor can parse — snap at the halfway point instead of
  // attempting to parse/lerp CSS color functions. This is a DOM-only
  // cosmetic (src/ui/settlementLabels.css reads it indirectly via
  // SETTLEMENT_LABEL_COLOR_CSS-style constants, not read by any
  // three.js material), so a snap instead of a smooth fade is a low-cost
  // simplification, not a visible day/night seam in the 3D scene itself.
  result.labelBg = clampedT < 0.5 ? a.labelBg : b.labelBg;
  result.mood = clampedT < 0.5 ? a.mood : b.mood;

  return result;
}

/** Convenience: blends the standard GHIBLI_DAY/GHIBLI_NIGHT pair by a
 * night-blend factor (0 = day, 1 = night) — what engine.ts actually calls
 * each frame, since it always blends between the two named palettes, not
 * arbitrary ones. */
export function blendedDayNightPalette(nightBlendFactor: number): WorldPalette {
  return lerpPalette(paletteForMood("day"), paletteForMood("night"), nightBlendFactor);
}
