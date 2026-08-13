// Adapted from kuku (github.com/kuku-mom/kuku), MIT License — see
// /THIRD_PARTY_NOTICES.md. Original:
// apps/desktop/src/plugins/builtin/voxel_graph/world/palette.ts
//
// `WorldPalette` and `GHIBLI_DAY` are ported verbatim. `GHIBLI_NIGHT` is
// genuinely new — kuku never had a night palette (its own paletteForMood
// was a permanent day-only stub, "the world is intentionally always
// daytime"), so there was nothing to port for this half. `clusterAccent`
// (kuku's per-island accent-color helper) still isn't ported — nothing in
// Phases 1-3 needed it, and Phase 3 (settlement markers) ended up not using
// a per-settlement accent color.
//
// ── Agent World Palette ──
//
// A single, hand-tuned daytime palette in the spirit of painterly Japanese
// animation: soft sage greens, muted teal water, warm tan earth, cream walls
// under dark sloped roofs, and a warm near-black "ink" used for cel outlines.
// Every world generator reads colors from here only, so the whole world
// re-skins from one place.

export type WorldMood = "day" | "night";

export interface WorldPalette {
  mood: WorldMood;

  /** Warm near-black used for every cel outline. */
  ink: string;

  // Atmosphere
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  ambient: string;
  ambientIntensity: number;

  // Sky bodies
  cloud: string;
  cloudShadow: string;
  sunGlow: string;

  // Water
  water: string;
  waterDeep: string;
  waterShallow: string;
  waveLine: string;
  foam: string;

  // Terrain
  grassLight: string;
  grass: string;
  grassDark: string;
  cliff: string; // earthy island sides
  cliffDark: string;
  sand: string;
  pathDirt: string;
  plaza: string;

  // Nature
  trunk: string;
  trunkDark: string;
  canopyLight: string;
  canopy: string;
  canopyDark: string;
  pine: string;
  bush: string;
  rock: string;
  rockDark: string;
  flowers: string[];
  crop: string;
  fieldSoil: string;

  // Buildings
  wallLight: string;
  wall: string;
  wallShadow: string;
  roof: string;
  roofRidge: string;
  beam: string;
  door: string;
  window: string;
  windowWarm: string;
  foundation: string;

  // Effects & markers
  beacon: string;
  focusFlag: string;
  trail: string;

  // Labels
  labelText: string;
  labelBg: string;
}

const GHIBLI_DAY: WorldPalette = {
  mood: "day",

  ink: "#2c2a26",

  skyTop: "#93d2d6",
  skyHorizon: "#e2f1ea",
  fog: "#dcefe8",
  fogDensity: 0.00038,
  hemiSky: "#e8f1e6",
  hemiGround: "#90a766",
  hemiIntensity: 0.42,
  sunColor: "#fff4d6",
  sunIntensity: 2.45,
  ambient: "#e0ede6",
  ambientIntensity: 0.4,

  cloud: "#fbfaf2",
  cloudShadow: "#dde8e1",
  sunGlow: "#fff0c8",

  water: "#4f9aa0",
  waterDeep: "#356f78",
  waterShallow: "#84c2bd",
  waveLine: "#bfe2dc",
  foam: "#f3f8f3",

  grassLight: "#aad673",
  grass: "#8cc25d",
  grassDark: "#69a64f",
  cliff: "#c4aa78",
  cliffDark: "#a3855a",
  sand: "#e6d6a6",
  pathDirt: "#c8b083",
  plaza: "#cdbb8c",

  trunk: "#7d5a3a",
  trunkDark: "#5c4128",
  canopyLight: "#80b15a",
  canopy: "#5f9a48",
  canopyDark: "#477937",
  pine: "#3f7a4e",
  bush: "#6fa84f",
  rock: "#9ba4a0",
  rockDark: "#76817b",
  flowers: ["#e86a5a", "#f3c24f", "#e58bbf", "#8aa9e0", "#fbf6ec"],
  crop: "#d3b94f",
  fieldSoil: "#9c7a4e",

  wallLight: "#f4ede1",
  wall: "#e8ddc9",
  wallShadow: "#d6c8ae",
  roof: "#56656f",
  roofRidge: "#3e484f",
  beam: "#6e5236",
  door: "#7c5230",
  window: "#bfe2e6",
  windowWarm: "#f4cd8c",
  foundation: "#9c958a",

  beacon: "#5ec6e0",
  focusFlag: "#f08a4a",
  trail: "#ffe6a6",

  labelText: "#33403c",
  labelBg: "rgba(252,250,243,0.82)",
};

// Hand-tuned night companion to GHIBLI_DAY — deep-blue/indigo sky, dimmed
// and desaturated terrain/nature so shadows never go pure black (a touch of
// ambient always keeps some light, classic stylized-night technique), and
// warm lit windows as the key "cozy at night" payoff (dovetails directly
// with Phase 5's hearth glow — a lit window costs nothing extra once this
// exists). Every field mirrors GHIBLI_DAY's shape so paletteBlendFor (in
// dayNightCycle.ts) can lerp between the two field-by-field.
const GHIBLI_NIGHT: WorldPalette = {
  mood: "night",

  ink: "#15141a",

  skyTop: "#0f1a3a",
  skyHorizon: "#2b3a5c",
  fog: "#1c2440",
  fogDensity: 0.00046,
  hemiSky: "#2a3352",
  hemiGround: "#232a3e",
  hemiIntensity: 0.28,
  sunColor: "#b7c4e8", // repurposed as moonlight — cooler, dimmer
  sunIntensity: 0.55,
  ambient: "#33395c",
  ambientIntensity: 0.32, // never fully dark — classic stylized-night floor

  cloud: "#3a4468",
  cloudShadow: "#262c46",
  sunGlow: "#c9d4f2", // moon glow

  water: "#1e2f52",
  waterDeep: "#131f3a",
  waterShallow: "#2c4468",
  waveLine: "#3d5a82",
  foam: "#cdd8ee",

  grassLight: "#4c5a6e",
  grass: "#3c4a5e",
  grassDark: "#2c3a4c",
  cliff: "#4a4258",
  cliffDark: "#342e42",
  sand: "#5a5670",
  pathDirt: "#463f56",
  plaza: "#454060",

  trunk: "#3a2f3e",
  trunkDark: "#281f2c",
  canopyLight: "#3a4a52",
  canopy: "#2c3c44",
  canopyDark: "#1f2c32",
  pine: "#243a38",
  bush: "#2e3c3e",
  rock: "#4a4e5c",
  rockDark: "#363a46",
  flowers: ["#8a4a6a", "#7a6a3a", "#7a5a80", "#5a6a9a", "#8a8298"],
  crop: "#6a5a3a",
  fieldSoil: "#443a4a",

  wallLight: "#4a4658",
  wall: "#3e3a4c",
  wallShadow: "#2e2c3c",
  roof: "#22212e",
  roofRidge: "#18171f",
  beam: "#332c3a",
  door: "#2e2436",
  window: "#4a5670",
  windowWarm: "#f4cd8c", // stays warm — the lit-window payoff, unchanged from day
  foundation: "#42404e",

  // Brightened/more-saturated relative to surroundings — a beacon/focus
  // marker should read as MORE prominent against a dark scene, the inverse
  // of most other fields here.
  beacon: "#7ee0ff",
  focusFlag: "#ff9a52",
  trail: "#ffdb8a",

  labelText: "#e8e4f0",
  labelBg: "rgba(28,26,40,0.85)",
};

export function paletteForMood(mood: WorldMood): WorldPalette {
  return mood === "night" ? GHIBLI_NIGHT : GHIBLI_DAY;
}
