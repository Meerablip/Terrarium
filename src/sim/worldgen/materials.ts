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

export function generateMaterials(worldWidth: number, worldHeight: number, rng: Rng): MaterialStore {
  const store = createMaterialStore(Math.max(MATERIAL_COUNT * 2, 32));

  for (let i = 0; i < MATERIAL_COUNT; i++) {
    const x = randRange(rng, 0, worldWidth);
    const y = randRange(rng, 0, worldHeight);
    const kind = randInt(rng, 0, MATERIAL_KIND_COUNT - 1);
    const quantity = randRange(rng, MATERIAL_QTY_MIN, MATERIAL_QTY_MAX);
    spawnMaterial(store, x, y, kind, quantity);
  }

  return store;
}
