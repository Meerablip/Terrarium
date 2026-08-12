// Shared color constants for the render layer. Kept in one place and mirrored
// by hand in statPanel.css (small enough surface that a build-time
// conversion between Pixi's numeric colors and CSS hex isn't worth it).

/** Warm beige canvas background — "printed map," not stark white or gray. */
export const BACKGROUND_COLOR = 0xede6d6;
export const BACKGROUND_COLOR_CSS = "#EDE6D6";

/** Near-black ink used for citizens and sparse text — never pure black. */
export const INK_COLOR = 0x1a1a1a;
export const INK_COLOR_CSS = "#1a1a1a";

/** Terrain tint ramp: low-resource cells read as bare background, high-resource
 * cells take on a faint, muted sage-green tint. Kept deliberately subtle — a
 * cell at full resource should still read as "background with a hint of
 * green texture," not a saturated fill — so terrain never competes visually
 * with citizens, per the visual spec ("terrain should read as texture"). */
export const TERRAIN_LOW_TINT = { r: 0xed, g: 0xe6, b: 0xd6 }; // == BACKGROUND_COLOR
export const TERRAIN_HIGH_TINT = { r: 0xc7, g: 0xd6, b: 0xb8 }; // background nudged toward sage

// --- Phase 2 additions ---

/** Path wear tint target: cells with heavy foot traffic nudge toward a
 * worn, dusty brown-beige — subtle, per the visual spec's "texture, not
 * heatmap" rule, same as the terrain resource ramp above. */
export const PATH_WEAR_TINT = { r: 0xc9, g: 0xb8, b: 0x9a };

/** Weather tint target: an active weather region nudges toward a slightly
 * cooler, more saturated green than the terrain-resource ramp's high end —
 * distinguishable from "just fertile ground" without reading as an alarm. */
export const WEATHER_TINT = { r: 0x9d, g: 0xb8, b: 0x8f };

/** Material dot colors, indexed by kind (0=wood, 1=stone, ...) — a plain
 * array lookup, never a switch statement, so a third kind is one more
 * entry here and nowhere else. */
export const MATERIAL_KIND_COLORS: number[] = [
  0x8a5a34, // wood — warm brown
  0x8a8a8a, // stone — neutral gray
];

/** Home sprite colors: dim/under-construction vs. the completed structure. */
export const HOME_UNDER_CONSTRUCTION_COLOR = 0xa89a7c;
export const HOME_COMPLETE_COLOR = INK_COLOR;

/** Settlement tier colors (map view icons + DOM label accents), one step
 * darker/richer per tier so hut/village/city read as a size progression at
 * a glance. */
export const SETTLEMENT_TIER_COLORS: Record<"hut" | "village" | "city", number> = {
  hut: 0x8a7a5c,
  village: 0x6b5a3c,
  city: INK_COLOR,
};
export const SETTLEMENT_LABEL_COLOR_CSS = "#1a1a1a";
