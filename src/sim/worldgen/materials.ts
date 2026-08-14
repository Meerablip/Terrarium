// World-gen placement for Material entities (Phase 2, rule 3). Called from
// createWorld in the same pass, using the same seeded rng, as terrain blob
// generation — so a given WORLD_SEED reproduces the exact same material
// layout every run, matching the determinism the rest of world-gen relies on.
//
// Materials are scattered uniformly at random across world bounds — "scattered
// sparsely" needs nothing more than a flat count and uniform placement; no
// clustering/blob logic like terrain, since these are meant to be independent
// point resources a citizen paths to individually, not a continuous field.

import { MATERIAL_COUNT, MATERIAL_KIND_COUNT, MATERIAL_QTY_MAX, MATERIAL_QTY_MIN } from "../constants.ts";
import { createMaterialStore, spawnMaterial, type MaterialStore } from "../ecs/materialStore.ts";
import { randInt, randRange, type Rng } from "../rng.ts";
import { isWaterAt, type TerrainGrid } from "../terrain.ts";

export function generateMaterials(terrain: TerrainGrid, rng: Rng): MaterialStore {
  const worldWidth = terrain.cols * terrain.cellSize;
  const worldHeight = terrain.rows * terrain.cellSize;
  const store = createMaterialStore(Math.max(MATERIAL_COUNT * 2, 32));

  for (let i = 0; i < MATERIAL_COUNT; i++) {
    // Bounded resample away from water — see world.ts's randomLandPosition
    // for why a small fixed cap is enough in practice.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = randRange(rng, 0, worldWidth);
      y = randRange(rng, 0, worldHeight);
      if (!isWaterAt(terrain, x, y)) break;
    }
    const kind = randInt(rng, 0, MATERIAL_KIND_COUNT - 1);
    const quantity = randRange(rng, MATERIAL_QTY_MIN, MATERIAL_QTY_MAX);
    spawnMaterial(store, x, y, kind, quantity);
  }

  return store;
}
