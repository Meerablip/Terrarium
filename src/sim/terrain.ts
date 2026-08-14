// Terrain: a 2D grid of cells, each with a current `resource` value and a
// max `capacity`. Stored as flat row-major Float32Arrays (not nested
// arrays) — this keeps cell iteration cache-friendly (the render layer walks
// every cell on every redraw) and means the grid's backing ArrayBuffers are
// directly Transferable, which matters if the sim tick loop ever moves into
// a Web Worker.

import {
  AGRICULTURE_MULTIPLIER,
  AGRICULTURE_RADIUS_CELLS,
  CELL_SIZE,
  GRID_COLS,
  GRID_ROWS,
  PATH_WEAR_DECAY_RATE,
  PATH_WEAR_INCREMENT,
  PATH_WEAR_MAX,
  POND_COUNT,
  POND_EDGE_JITTER,
  POND_RADIUS_CELLS,
  REGROWTH_RATE,
  TERRAIN_BASE_CAPACITY,
  TERRAIN_BLOB_COUNT,
  TERRAIN_BLOB_PEAK_MAX,
  TERRAIN_BLOB_PEAK_MIN,
  TERRAIN_BLOB_SIGMA_MAX,
  TERRAIN_BLOB_SIGMA_MIN,
  TERRAIN_MIN_STARTING_FRACTION,
  TERRAIN_NOISE_AMPLITUDE,
  WEATHER_MOISTURE_BOOST,
} from "./constants.ts";
import type { CitizenStore } from "./ecs/store.ts";
import type { HomeRegistry } from "./homes.ts";
import { gaussianFalloff, randRange, type Rng } from "./rng.ts";
import { isInWeatherRegion, type WeatherState } from "./weather.ts";

export interface TerrainGrid {
  cols: number;
  rows: number;
  cellSize: number;
  /** Current resource per cell, flat row-major, length cols*rows. */
  resource: Float32Array;
  /** Max resource per cell, flat row-major, length cols*rows. */
  capacity: Float32Array;
  /** Wear scalar per cell (Phase 2, rule 6), flat row-major, length cols*rows.
   * Rises where citizens walk, decays everywhere over time. Feeds the
   * ground-view subtle tint and the map-view road-line threshold. */
  pathWear: Float32Array;
  /** Scratch buffer reused across regrowTerrain calls for the agriculture
   * home-proximity multiplier (see regrowTerrain) — allocated once here
   * rather than per-call, matching the existing "persistent scratch array"
   * pattern already used by terrain generation. */
  homeBoostScratch: Float32Array;
  /** 1 where a cell is a pond, 0 elsewhere, flat row-major, length cols*rows.
   * Always allocated (even when no pond was generated — see generatePonds)
   * so every consumer can assume the field exists rather than checking for
   * undefined. A water cell's resource/capacity are forced to 0 at
   * generation time, so nothing forages there — it's not modeled as an
   * obstacle citizens path around, just as ground with nothing to gain from
   * standing on it. */
  isWater: Uint8Array;
}

export function cellIndex(grid: TerrainGrid, cx: number, cy: number): number {
  return cy * grid.cols + cx;
}

export function worldToCell(grid: TerrainGrid, x: number, y: number): { cx: number; cy: number } {
  const cx = clamp(Math.floor(x / grid.cellSize), 0, grid.cols - 1);
  const cy = clamp(Math.floor(y / grid.cellSize), 0, grid.rows - 1);
  return { cx, cy };
}

export function isWaterAt(grid: TerrainGrid, x: number, y: number): boolean {
  const { cx, cy } = worldToCell(grid, x, y);
  return grid.isWater[cellIndex(grid, cx, cy)] === 1;
}

export function cellToWorldCenter(grid: TerrainGrid, cx: number, cy: number): { x: number; y: number } {
  return {
    x: cx * grid.cellSize + grid.cellSize / 2,
    y: cy * grid.cellSize + grid.cellSize / 2,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Generates terrain with a few random fertile gaussian "blobs" plus noise,
 * so multiple resource-rich patches exist independently rather than one
 * blob dominating.
 *
 * Algorithm:
 *  1. Capacity is uniform across all cells (richness is expressed entirely
 *     via how full the current resource value is, not via varying capacity).
 *  2. Place TERRAIN_BLOB_COUNT gaussian blobs at independent uniformly-random
 *     centers, each with its own random sigma (spread) and peak (strength).
 *  3. Accumulate blobs additively into a scratch [0,~] field.
 *  4. Add uniform white noise to texture the result (no noise library —
 *     keeps dependencies minimal; sufficient at this render style, which is
 *     a subtle tint, not a contour map).
 *  5. Normalize to [TERRAIN_MIN_STARTING_FRACTION, 1] of capacity, so every
 *     cell starts with *some* resource (no dead zero-resource cells
 *     stranding citizens turn one) while preserving contrast between blob
 *     centers and inter-blob gaps.
 */
export function createTerrain(
  cols: number,
  rows: number,
  cellSize: number,
  rng: Rng,
): TerrainGrid {
  const cellCount = cols * rows;
  const capacity = new Float32Array(cellCount).fill(TERRAIN_BASE_CAPACITY);
  const field = new Float32Array(cellCount);

  interface Blob {
    bx: number;
    by: number;
    sigma: number;
    peak: number;
  }
  const blobs: Blob[] = [];
  for (let i = 0; i < TERRAIN_BLOB_COUNT; i++) {
    blobs.push({
      bx: randRange(rng, 0, cols),
      by: randRange(rng, 0, rows),
      sigma: randRange(rng, TERRAIN_BLOB_SIGMA_MIN, TERRAIN_BLOB_SIGMA_MAX),
      peak: randRange(rng, TERRAIN_BLOB_PEAK_MIN, TERRAIN_BLOB_PEAK_MAX),
    });
  }

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;
      let value = 0;
      for (const blob of blobs) {
        value += blob.peak * gaussianFalloff(cx - blob.bx, cy - blob.by, blob.sigma);
      }
      value += (rng() * 2 - 1) * TERRAIN_NOISE_AMPLITUDE;
      field[idx] = value;
    }
  }

  const resource = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const t = clamp(field[i], 0, 1);
    resource[i] = capacity[i] * (TERRAIN_MIN_STARTING_FRACTION + t * (1 - TERRAIN_MIN_STARTING_FRACTION));
  }

  return {
    cols,
    rows,
    cellSize,
    resource,
    capacity,
    pathWear: new Float32Array(cellCount),
    homeBoostScratch: new Float32Array(cellCount),
    isWater: new Uint8Array(cellCount),
  };
}

/**
 * Carves POND_COUNT roughly-circular ponds out of already-generated terrain:
 * marks cells water and zeroes their resource/capacity. Deliberately a
 * separate call rather than folded into createTerrain's own blob-gen pass —
 * see the POND_* constants' doc comment for why (createWorld calls this
 * explicitly; createTerrain's direct callers, i.e. every existing unit test,
 * never see a pond and their rng draw sequence is untouched).
 *
 * No-ops on a world too small to fit a pond with breathing room, rather than
 * producing a pond that eats the whole map or a degenerate randRange call.
 */
export function generatePonds(terrain: TerrainGrid, rng: Rng): void {
  const { cols, rows } = terrain;
  const margin = POND_RADIUS_CELLS + 2;
  if (cols <= margin * 2 || rows <= margin * 2) return;

  for (let p = 0; p < POND_COUNT; p++) {
    const centerCx = randRange(rng, margin, cols - margin);
    const centerCy = randRange(rng, margin, rows - margin);

    // Smooth organic wobble: a few sine harmonics, phase/amplitude rolled
    // ONCE per pond, evaluated as a function of angle. This is what makes it
    // a lumpy-but-solid blob rather than the per-cell-independent-noise
    // version this replaced, which perturbed the radius test with a fresh
    // random value at every single cell — that produces salt-and-pepper
    // speckling right at the boundary (stray water cells poking out,
    // stray gaps poking in) instead of a coherent wobbly shoreline, which is
    // exactly what read as "not formed properly."
    const harmonics = [2, 3, 5].map((freq) => ({
      freq,
      phase: rng() * Math.PI * 2,
      amp: (POND_EDGE_JITTER * (0.5 + rng() * 0.5)) / freq,
    }));

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const dx = cx - centerCx;
        const dy = cy - centerCy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        let wobble = 0;
        for (const h of harmonics) wobble += h.amp * Math.sin(angle * h.freq + h.phase);
        if (dist > POND_RADIUS_CELLS + wobble) continue;

        const idx = cellIndex(terrain, cx, cy);
        terrain.isWater[idx] = 1;
        terrain.capacity[idx] = 0;
        terrain.resource[idx] = 0;
      }
    }
  }
}

/**
 * Rule 1 (extended for Phase 2): each cell's resource regrows toward capacity
 * by a fixed rate per tick, boosted by two additive multipliers — agriculture
 * (rule 5) and weather (rule 7) — and pathWear decays by a fixed rate per
 * tick in the same pass (rule 6). All three stay inside this one function
 * rather than becoming new systems, per the spec's explicit instruction:
 * they're terrain data, updated in the terrain step tick() already has.
 *
 * Agriculture: precomputes a homeBoostMask (reused scratch buffer) — for
 * each *complete* Home, cells within AGRICULTURE_RADIUS_CELLS get
 * max()'d up to AGRICULTURE_MULTIPLIER (max, not multiplicative stacking,
 * so overlapping home radii don't compound into runaway regrowth as
 * settlements densify).
 *
 * Weather: while active, cells inside the event's region get an additional
 * WEATHER_MOISTURE_BOOST multiplier, checked inline per cell (no persistent
 * mask — weather is transient/small-region, cheaper to recompute than to
 * maintain and clear another full-grid array every tick).
 */
export function regrowTerrain(grid: TerrainGrid, homes: HomeRegistry, weather: WeatherState): void {
  const { resource, capacity, pathWear, homeBoostScratch } = grid;

  homeBoostScratch.fill(1.0);
  for (const home of homes.homes.values()) {
    if (!home.complete) continue;
    const { cx: homeCx, cy: homeCy } = worldToCell(grid, home.x, home.y);
    const minCx = Math.max(0, homeCx - AGRICULTURE_RADIUS_CELLS);
    const maxCx = Math.min(grid.cols - 1, homeCx + AGRICULTURE_RADIUS_CELLS);
    const minCy = Math.max(0, homeCy - AGRICULTURE_RADIUS_CELLS);
    const maxCy = Math.min(grid.rows - 1, homeCy + AGRICULTURE_RADIUS_CELLS);
    const radiusSq = AGRICULTURE_RADIUS_CELLS * AGRICULTURE_RADIUS_CELLS;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dCx = cx - homeCx;
        const dCy = cy - homeCy;
        if (dCx * dCx + dCy * dCy > radiusSq) continue;
        const idx = cellIndex(grid, cx, cy);
        homeBoostScratch[idx] = Math.max(homeBoostScratch[idx], AGRICULTURE_MULTIPLIER);
      }
    }
  }

  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      const idx = cellIndex(grid, cx, cy);
      const { x: worldX, y: worldY } = cellToWorldCenter(grid, cx, cy);
      const weatherMultiplier = isInWeatherRegion(weather, worldX, worldY) ? WEATHER_MOISTURE_BOOST : 1;

      const next = resource[idx] + REGROWTH_RATE * homeBoostScratch[idx] * weatherMultiplier;
      resource[idx] = next > capacity[idx] ? capacity[idx] : next;

      pathWear[idx] = Math.max(0, pathWear[idx] - PATH_WEAR_DECAY_RATE);
    }
  }
}

/** Rule 6 (increment half): cells a citizen currently occupies get a small
 * wear increment each tick, clamped at PATH_WEAR_MAX. Decay (the other half
 * of rule 6) is folded into regrowTerrain's per-cell loop above — this is a
 * separate, smaller pass (bounded by live population, not the full grid)
 * since it's driven by citizen positions rather than terrain data alone. */
export function applyPathWear(grid: TerrainGrid, citizens: CitizenStore): void {
  for (let slot = 0; slot < citizens.count; slot++) {
    const { cx, cy } = worldToCell(grid, citizens.x[slot], citizens.y[slot]);
    const idx = cellIndex(grid, cx, cy);
    grid.pathWear[idx] = Math.min(PATH_WEAR_MAX, grid.pathWear[idx] + PATH_WEAR_INCREMENT);
  }
}

/** Convenience default-config factory, used by world.ts. */
export function createDefaultTerrain(rng: Rng): TerrainGrid {
  return createTerrain(GRID_COLS, GRID_ROWS, CELL_SIZE, rng);
}
