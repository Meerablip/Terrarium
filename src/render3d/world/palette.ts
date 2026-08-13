// Adapted from kuku (github.com/kuku-mom/kuku), MIT License — see
// /THIRD_PARTY_NOTICES.md. Original:
// apps/desktop/src/plugins/builtin/voxel_graph/world/palette.ts
//
// `WorldPalette` and `GHIBLI_DAY` are ported verbatim. `paletteForMood` is
// kept as kuku's own honest stub for now — it always returns the day
// palette regardless of `mood`, same as upstream. Phase 4 (night cycle) adds
// a real `GHIBLI_NIGHT` and makes this branch; see that phase in the
// implementation plan before touching this function. `clusterAccent`
// (kuku's per-island accent-color helper) isn't ported yet — nothing in
// Phase 1-2 needs it, and Phase 3 (settlement markers) will decide whether
// Terrarium wants a per-settlement accent at all before porting it.
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

export function paletteForMood(_mood: WorldMood): WorldPalette {
  // TODO(Phase 4 — night cycle): always returns day for now, same as kuku's
  // own upstream stub. Add GHIBLI_NIGHT and branch on _mood here.
  return GHIBLI_DAY;
}
