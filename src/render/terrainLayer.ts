// Terrain: a grass base, with three things drawn over it.
//
//  - A pond, if the world has one (state.terrain.isWater) — static for the
//    whole life of the world (ponds are carved once at world-gen, see
//    sim/terrain.ts's generatePonds), so unlike the other two overlays this
//    one is built exactly once and never touched again.
//  - A bare-dirt "cleared" patch around each Home. Driven by home
//    *position* (state.homes), which only ever grows a home's footprint
//    outward and never flickers cell-to-cell — unlike the pathWear scalar
//    this used to read (rises per occupying citizen per tick, decays
//    slowly), which under real population density crossed its visibility
//    threshold every few ticks and read as the ground flickering on every
//    step. Homes are the sim's actual "agents clearing land to build"
//    event, so tying bareness to them instead is both truer to the fiction
//    and stable.
//  - Sparse decorative grass-tuft patches that grow in slowly over real
//    time (see updateTerrainLayer), independent of anything citizens do.
//    Purely cosmetic ground texture — never removed except by a home's
//    clearing radius passing over them.
//
// Water and cleared ground are drawn as smooth vector shapes (Graphics),
// not the 16px-grid autotiled blob sprites this used to use. That old
// approach snaps every edge to the cell grid using only 13 discrete tile
// variants (this asset pack's "classic minimal blob set" — it doesn't ship
// a full 47-tile one), which reads as blocky/jagged, especially once
// several home clearings overlap. A pond's true shape is a smooth
// mathematical curve (see generatePonds) and a home's clearing is just a
// circle — there's no reason to round either down to a stair-stepped tile
// grid at all when Pixi can fill an arbitrary smooth polygon directly. See
// contour.ts for the boundary-extraction + smoothing used for the pond.
//
// Cost control carries over from the old design: cells are only touched
// when their own classification changes, not rebuilt every snapshot.

import { Container, Graphics, Sprite } from "pixi.js";

import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { getDirtFillTexture, getGrassPatchTexture, getGrassTexture, getWaterFillTexture } from "./assets.ts";
import { expandFromCentroid, smoothClosedPolygon, traceBoundary, type Point } from "./contour.ts";

/** Cells within this many grid steps of a home's centre read as cleared
 * ground. A small fixed "yard" footprint rather than something that scales
 * with buildProgress — a home clears its plot as soon as it's founded, not
 * only once finished. Also the radius of the vector circle drawn for it —
 * see drawHomeClearing. */
const HOME_CLEAR_RADIUS_CELLS = 2;

/** How much larger the soft translucent "fringe" is drawn than the shape it
 * surrounds, for both the pond and each home clearing — a cheap stand-in
 * for a blurred edge (see contour.ts's expandFromCentroid / the circle-halo
 * in drawHomeClearing). */
const FRINGE_SCALE = 1.3;
const FRINGE_ALPHA = 0.45;
/** A muted grass green close to the base grass tile's own tone, so the
 * fringe reads as "grass thinning out" rather than a foreign color. */
const FRINGE_COLOR = 0x5b8c46;

/** Chaikin corner-cutting passes applied to the pond's traced boundary.
 * Each pass doubles the point count; 3 is comfortably smooth for a ~10-cell
 * pond without generating an absurd number of points. */
const POND_SMOOTH_ITERATIONS = 3;

/** Fraction of cells that start with a grass-tuft patch on first load. Was
 * 0.12 — on a freshly generated world (i.e. right after every reset) that
 * read as sparse/unfinished rather than "still growing in," since growth
 * itself is deliberately slow (see GROWTH_INTERVAL_SECONDS below). Raised so
 * a brand-new world already looks reasonably lush, with growth topping it up
 * toward MAX_PATCH_COVERAGE rather than doing most of the work. */
const INITIAL_PATCH_CHANCE = 0.3;

/** Growth stops once this fraction of (uncleared) cells carry a patch, so
 * the ground still reads as "grass patches AND normal ground" (the original
 * ask) rather than eventually tiling into a uniform tuft carpet. */
const MAX_PATCH_COVERAGE = 0.6;

/** Real seconds between growth passes. Slow and steady is the point — this
 * is the opposite of the per-tick footstep flicker it replaces. */
const GROWTH_INTERVAL_SECONDS = 1.4;

/** Cells attempted (not necessarily planted — occupied/cleared cells are
 * skipped) per growth pass. */
const GROWTH_ATTEMPTS_PER_INTERVAL = 5;

export interface TerrainLayer {
  container: Container;
  clearedGraphics: Graphics;
  patchLayer: Container;

  groundBuilt: boolean;
  cols: number;
  rows: number;
  cellSize: number;

  /** Per-cell "is this a pond" — static once built (see buildWaterOverlay).
   * Read by grass-patch seeding/growth and by natureLayer.ts, both of which
   * skip water the same way they skip cleared cells. */
  isWater: Uint8Array;

  /** Per-cell "is this a home's cleared yard" from the last sync. Only ever
   * flips 0 -> 1 (homes aren't removed, so a cleared cell stays cleared).
   * Drives grass-patch/nature-layer avoidance — the VISUAL clearing is a
   * vector circle per home (see drawnHomeIds), not derived from this grid,
   * but both are computed from the same radius so they line up. */
  cleared: Uint8Array;
  /** Home ids whose clearing circle has already been drawn into
   * clearedGraphics, so a home only gets drawn once. */
  drawnHomeIds: Set<number>;

  hasPatch: Uint8Array;
  patchSprites: (Sprite | null)[];
  patchCount: number;
  growthTimer: number;
}

export function createTerrainLayer(): TerrainLayer {
  return {
    container: new Container(),
    clearedGraphics: new Graphics(),
    patchLayer: new Container(),
    groundBuilt: false,
    cols: 0,
    rows: 0,
    cellSize: 0,
    isWater: new Uint8Array(0),
    cleared: new Uint8Array(0),
    drawnHomeIds: new Set(),
    hasPatch: new Uint8Array(0),
    patchSprites: [],
    patchCount: 0,
    growthTimer: 0,
  };
}

/** Lays down the immutable grass base once. Grass is drawn for every cell
 * (including future water/cleared cells) because both overlays composite
 * cleanly over a full base rather than needing a cut-out. */
function buildGrassBase(layer: TerrainLayer, cols: number, rows: number, cellSize: number): void {
  const grass = getGrassTexture();
  const base = new Container();
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const sprite = new Sprite(grass);
      sprite.x = cx * cellSize;
      sprite.y = cy * cellSize;
      sprite.width = cellSize;
      sprite.height = cellSize;
      base.addChild(sprite);
    }
  }
  layer.container.addChild(base);
}

function toWorldPoints(points: Point[], cellSize: number): number[] {
  const flat: number[] = [];
  for (const p of points) {
    flat.push(p.x * cellSize, p.y * cellSize);
  }
  return flat;
}

/** Draws the pond, once, as a smooth filled shape traced from the water
 * mask. Unlike the cleared overlay, water never changes after world-gen, so
 * there's no diffing machinery here — one pass at first build. */
function buildWaterOverlay(layer: TerrainLayer, cols: number, rows: number, cellSize: number): void {
  if (!layer.isWater.some((v) => v === 1)) return; // no pond in this world

  const isWaterAt = (cx: number, cy: number): boolean => layer.isWater[cy * cols + cx] === 1;
  const loops = traceBoundary(isWaterAt, cols, rows);
  const graphics = new Graphics();

  for (const loop of loops) {
    const smooth = smoothClosedPolygon(loop, POND_SMOOTH_ITERATIONS);
    const halo = expandFromCentroid(smooth, FRINGE_SCALE);
    graphics.poly(toWorldPoints(halo, cellSize)).fill({ color: FRINGE_COLOR, alpha: FRINGE_ALPHA });
    graphics.poly(toWorldPoints(smooth, cellSize)).fill({ texture: getWaterFillTexture(), textureSpace: "global" });
  }

  layer.container.addChild(graphics);
}

/** Draws one home's clearing as a soft-edged filled circle — a halo ring
 * for the "grass thinning out" fringe, then the actual dirt patch on top.
 * Genuinely circular in world space, not snapped to any grid. */
function drawHomeClearing(layer: TerrainLayer, x: number, y: number): void {
  const radius = HOME_CLEAR_RADIUS_CELLS * layer.cellSize;
  layer.clearedGraphics.circle(x, y, radius * FRINGE_SCALE).fill({ color: FRINGE_COLOR, alpha: FRINGE_ALPHA });
  layer.clearedGraphics.circle(x, y, radius).fill({ texture: getDirtFillTexture(), textureSpace: "global" });
}

/** Deterministic pseudo-random in [0, 1) for a cell — used for the initial
 * patch pattern and variant choice, not gameplay, so it doesn't need to
 * share the sim's seeded rng. */
function hashCell(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function addPatchAt(layer: TerrainLayer, idx: number, cx: number, cy: number): void {
  if (layer.hasPatch[idx]) return;
  const variant = Math.floor(hashCell(cx * 7 + 3, cy * 13 + 5) * 3);
  const sprite = new Sprite(getGrassPatchTexture(variant));
  sprite.x = cx * layer.cellSize;
  sprite.y = cy * layer.cellSize;
  sprite.width = layer.cellSize;
  sprite.height = layer.cellSize;
  layer.patchLayer.addChild(sprite);
  layer.patchSprites[idx] = sprite;
  layer.hasPatch[idx] = 1;
  layer.patchCount++;
}

function removePatchAt(layer: TerrainLayer, idx: number): void {
  const sprite = layer.patchSprites[idx];
  if (!sprite) return;
  layer.patchLayer.removeChild(sprite);
  sprite.destroy();
  layer.patchSprites[idx] = null;
  layer.hasPatch[idx] = 0;
  layer.patchCount--;
}

function seedInitialPatches(layer: TerrainLayer): void {
  for (let cy = 0; cy < layer.rows; cy++) {
    for (let cx = 0; cx < layer.cols; cx++) {
      const idx = cy * layer.cols + cx;
      if (layer.cleared[idx] || layer.isWater[idx]) continue;
      if (hashCell(cx, cy) >= INITIAL_PATCH_CHANCE) continue;
      addPatchAt(layer, idx, cx, cy);
    }
  }
}

function computeClearedCells(
  homes: WireSnapshotV1["homes"],
  cols: number,
  rows: number,
  cellSize: number,
): Uint8Array {
  const cleared = new Uint8Array(cols * rows);
  const radiusSq = HOME_CLEAR_RADIUS_CELLS * HOME_CLEAR_RADIUS_CELLS;

  for (const home of homes) {
    const homeCx = Math.min(cols - 1, Math.max(0, Math.floor(home.x / cellSize)));
    const homeCy = Math.min(rows - 1, Math.max(0, Math.floor(home.y / cellSize)));
    const minCx = Math.max(0, homeCx - HOME_CLEAR_RADIUS_CELLS);
    const maxCx = Math.min(cols - 1, homeCx + HOME_CLEAR_RADIUS_CELLS);
    const minCy = Math.max(0, homeCy - HOME_CLEAR_RADIUS_CELLS);
    const maxCy = Math.min(rows - 1, homeCy + HOME_CLEAR_RADIUS_CELLS);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dx = cx - homeCx;
        const dy = cy - homeCy;
        if (dx * dx + dy * dy > radiusSq) continue;
        cleared[cy * cols + cx] = 1;
      }
    }
  }

  return cleared;
}

/**
 * Syncs the cleared-yard overlay to the latest home positions. Call once per
 * snapshot; cheap when no home has newly claimed ground.
 */
export function syncTerrainLayer(
  layer: TerrainLayer,
  terrain: WireSnapshotV1["terrain"],
  homes: WireSnapshotV1["homes"],
): void {
  const { cols, rows, cellSize } = terrain;
  const cellCount = cols * rows;

  if (!layer.groundBuilt) {
    buildGrassBase(layer, cols, rows, cellSize);
    // Defensive fallback for a client reconnecting mid-deploy, before the
    // server side of this field has restarted — treat "field missing" as
    // "no pond" rather than crashing on Uint8Array.from(undefined).
    layer.isWater = terrain.isWater ? Uint8Array.from(terrain.isWater) : new Uint8Array(cellCount);
    buildWaterOverlay(layer, cols, rows, cellSize);
    layer.container.addChild(layer.clearedGraphics);
    layer.container.addChild(layer.patchLayer);
    layer.cleared = new Uint8Array(cellCount);
    layer.hasPatch = new Uint8Array(cellCount);
    layer.patchSprites = new Array<Sprite | null>(cellCount).fill(null);
    layer.cols = cols;
    layer.rows = rows;
    layer.cellSize = cellSize;
    layer.groundBuilt = true;
    seedInitialPatches(layer);
  }

  // Draw any home that's newly appeared this snapshot. A home's clearing
  // never moves or shrinks once drawn, so this is purely additive.
  for (const home of homes) {
    if (layer.drawnHomeIds.has(home.id)) continue;
    drawHomeClearing(layer, home.x, home.y);
    layer.drawnHomeIds.add(home.id);
  }

  // Cell-grid version of the same clearing, for grass-patch/nature-layer
  // avoidance (see addPatchAt/updateTerrainLayer and natureLayer.ts) — kept
  // even though the visible dirt is now vector-drawn above.
  const nextCleared = computeClearedCells(homes, cols, rows, cellSize);
  for (let i = 0; i < cellCount; i++) {
    if (nextCleared[i] === 1 && layer.cleared[i] === 0) {
      removePatchAt(layer, i); // agents trim whatever grass was there to build
    }
  }
  layer.cleared = nextCleared;
}

/**
 * Advances grass-patch growth. Purely decorative and time-driven — call
 * every rendered frame with real elapsed seconds. Deliberately NOT tied to
 * snapshot cadence or citizen positions: growth only ever adds patches
 * (ground clearing is the only thing that removes one), on a slow fixed
 * cadence, which is the whole fix for the old flicker.
 */
export function updateTerrainLayer(layer: TerrainLayer, deltaSeconds: number): void {
  if (!layer.groundBuilt) return;
  const cellCount = layer.cols * layer.rows;
  if (layer.patchCount / cellCount >= MAX_PATCH_COVERAGE) return;

  layer.growthTimer += deltaSeconds;
  while (layer.growthTimer >= GROWTH_INTERVAL_SECONDS) {
    layer.growthTimer -= GROWTH_INTERVAL_SECONDS;

    for (let attempt = 0; attempt < GROWTH_ATTEMPTS_PER_INTERVAL; attempt++) {
      const idx = Math.floor(Math.random() * cellCount);
      if (layer.cleared[idx] || layer.hasPatch[idx] || layer.isWater[idx]) continue;
      const cx = idx % layer.cols;
      const cy = (idx / layer.cols) | 0;
      addPatchAt(layer, idx, cx, cy);
    }
  }
}
