// Ported algorithms (not the whole file) from kuku (github.com/kuku-mom/kuku),
// MIT License — see /THIRD_PARTY_NOTICES.md. Original:
// apps/desktop/src/plugins/builtin/voxel_graph/voxel_layout.ts
//
// Only the domain-free pieces are ported here: `stableHash`/`stableNoise`
// (deterministic pseudo-random from a string seed, used throughout world/ —
// e.g. sky.ts's cloud/hill placement) and a couple of small numeric helpers.
//
// Everything kuku-specific is deliberately NOT ported: `computeIslands`'s
// circle-packing loop and `computePlots`'s sunflower distribution operate on
// note/folder data (GraphNode, GraphState) that has no Terrarium equivalent.
// Terrarium's settlements/homes/citizens already carry authoritative
// positions from the sim — nothing needs to be packed or placed by the
// renderer. The sizing-only half of that math (how big a settlement marker
// should read, given population) is reworked from scratch in Phase 3's
// world/settlements.ts against Terrarium's actual `tier`/`population`
// fields, not ported from `islandRadiusForPlots`'s note-count formula.

const UINT32_MAX = 4_294_967_295;

/** World units per voxel block. Kept for parity with kuku's grid-snapping
 * convention — Terrarium's own grid uses CELL_SIZE from sim/constants.ts for
 * simulation purposes; this BLOCK constant is purely a render-side snapping
 * unit for any decorative geometry that wants a tidy grid alignment. */
export const BLOCK = 4;

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable pseudo-random in [0, 1) derived from a string. */
export function stableNoise(value: string): number {
  return stableHash(value) / UINT32_MAX;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapToGrid(value: number, step = BLOCK): number {
  return Math.round(value / step) * step;
}
