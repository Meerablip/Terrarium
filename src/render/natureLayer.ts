// Permanent decorative scenery — trees, small trees, bushes, rocks — seeded
// once per world and never depleted.
//
// Deliberately NOT drawn from the sim's `materials` array. Those are a
// one-time, non-regenerating resource pool (spawned at world creation,
// consumed by citizens hauling wood/stone and never replenished), so any
// settlement that runs long enough strips its own surroundings bare — the
// world becomes genuinely, permanently treeless around anywhere populated,
// which is a real gap in the sim's material economy, not a rendering bug.
// This layer sidesteps it entirely: placement is a deterministic hash of
// cell coordinates, computed once client-side, with no connection to
// gameplay state, so scenery is always there regardless of how built-up or
// how old the world is. The only thing that removes a piece of scenery is a
// home's clearing radius growing over it — agents actually building there —
// which is exactly the "trim to build" behaviour terrainLayer.ts already
// implements for grass patches; this reuses that same `cleared` field.
//
// Sprites are added directly to the shared entity container (not a private
// one of this layer's own) so they y-sort against citizens, homes and
// material nodes correctly — see main.ts.

import { Sprite, type Container } from "pixi.js";

import { getBushTexture, getOakTreeTexture, getRockTexture, getSmallTreeTexture } from "./assets.ts";
import type { TerrainLayer } from "./terrainLayer.ts";

/** Decorations are placed at most one per block, not one roll per cell —
 * otherwise independent per-cell placement at any reasonable density packs
 * large tree canopies right next to each other. A block is 4 cells (64
 * world units) on a side, giving each piece of scenery real breathing room,
 * closer to the reference art's "generously spaced" look than a dense
 * scatter. */
const BLOCK_SIZE_CELLS = 4;

type DecorationKind = "tree" | "smallTree" | "bush" | "rock";

/** Cumulative thresholds against a single [0,1) roll. Most blocks (55%)
 * stay open ground — this is scenery, not a forest floor. */
function pickDecorationKind(roll: number): DecorationKind | null {
  if (roll < 0.55) return null;
  if (roll < 0.75) return "tree";
  if (roll < 0.85) return "smallTree";
  if (roll < 0.93) return "bush";
  return "rock";
}

export interface NatureLayer {
  parent: Container;
  seeded: boolean;
  /** Keyed by cell index, so a later clearing pass can look a decoration up
   * by the same index terrainLayer uses for `cleared`. */
  decorations: Map<number, Sprite>;
}

export function createNatureLayer(parent: Container): NatureLayer {
  return { parent, seeded: false, decorations: new Map() };
}

/** Deterministic pseudo-random in [0, 1) — independent of the sim's seeded
 * rng (purely cosmetic placement, not gameplay), and independent of
 * terrainLayer's own copy of this same idea: two unrelated randomness
 * streams that just happen to use the same trick. */
function hashCell(a: number, b: number): number {
  let h = Math.imul(a, 2654435761) + Math.imul(b, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function createDecorationSprite(kind: DecorationKind): Sprite {
  switch (kind) {
    case "rock": {
      const sprite = new Sprite(getRockTexture());
      sprite.anchor.set(0.5, 0.85);
      sprite.width = 32;
      sprite.height = 32;
      return sprite;
    }
    case "bush": {
      // Native art is mostly transparent padding around a small sapling —
      // at native scale it reads as a stray speck next to a full tree, so
      // it's drawn at 1.75x for real visual presence.
      const sprite = new Sprite(getBushTexture());
      sprite.anchor.set(0.5, 0.9);
      sprite.width = 56;
      sprite.height = 84;
      return sprite;
    }
    case "smallTree": {
      const variant = Math.random() < 0.5 ? 0 : 1;
      const sprite = new Sprite(getSmallTreeTexture(variant));
      sprite.anchor.set(0.5, 0.95);
      return sprite;
    }
    case "tree": {
      const sprite = new Sprite(getOakTreeTexture());
      sprite.anchor.set(0.5, 0.95);
      return sprite;
    }
  }
}

function seedDecorations(layer: NatureLayer, terrain: TerrainLayer): void {
  const { cols, rows, cellSize } = terrain;
  const blockCols = Math.ceil(cols / BLOCK_SIZE_CELLS);
  const blockRows = Math.ceil(rows / BLOCK_SIZE_CELLS);

  for (let by = 0; by < blockRows; by++) {
    for (let bx = 0; bx < blockCols; bx++) {
      const kind = pickDecorationKind(hashCell(bx * 92821 + 11, by * 68917 + 5));
      if (kind === null) continue;

      const offX = Math.floor(hashCell(bx * 13 + 3, by * 29 + 7) * BLOCK_SIZE_CELLS);
      const offY = Math.floor(hashCell(bx * 41 + 17, by * 19 + 23) * BLOCK_SIZE_CELLS);
      const cx = Math.min(cols - 1, bx * BLOCK_SIZE_CELLS + offX);
      const cy = Math.min(rows - 1, by * BLOCK_SIZE_CELLS + offY);
      const idx = cy * cols + cx;
      if (terrain.cleared[idx] || terrain.isWater[idx]) continue; // no scenery in a yard or a pond

      const sprite = createDecorationSprite(kind);
      sprite.x = cx * cellSize + cellSize / 2;
      sprite.y = cy * cellSize + cellSize / 2;
      sprite.zIndex = sprite.y;
      layer.parent.addChild(sprite);
      layer.decorations.set(idx, sprite);
    }
  }
}

/**
 * Seeds the permanent scatter on first call (once terrain dimensions and the
 * initial cleared set are known), then on every call removes whatever
 * scenery a home's growing clearing radius has since covered. Call once per
 * snapshot, after syncTerrainLayer.
 */
export function syncNatureLayer(layer: NatureLayer, terrain: TerrainLayer): void {
  if (!terrain.groundBuilt) return;

  if (!layer.seeded) {
    seedDecorations(layer, terrain);
    layer.seeded = true;
  }

  for (const [idx, sprite] of layer.decorations) {
    if (!terrain.cleared[idx]) continue;
    layer.parent.removeChild(sprite);
    sprite.destroy();
    layer.decorations.delete(idx);
  }
}
