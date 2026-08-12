// Rule 4: if a citizen's resource crosses REPRODUCTION_THRESHOLD, it spawns
// a child at its current position, splitting its resource roughly in half.
// Like death, spawning is deferred: this system pushes a SpawnRequest rather
// than calling spawnCitizen directly, so the store's structure (and thus
// store.count) stays stable for the full duration of every system's pass
// within a tick. See tick.ts for the deferred-mutation rationale.

import { MAX_POPULATION, REPRODUCTION_SPLIT_FRACTION, REPRODUCTION_THRESHOLD } from "../constants.ts";
import type { CitizenStore } from "../ecs/store.ts";

export interface SpawnRequest {
  x: number;
  y: number;
  heading: number;
  resource: number;
  visionRadius: number;
  speed: number;
  metabolismRate: number;
}

export function applyReproduction(store: CitizenStore, pendingSpawns: SpawnRequest[]): void {
  // Cap against store.count (this tick's stable pre-mutation count) plus
  // spawns already queued this tick, so a burst of simultaneous
  // reproductions can't blow past MAX_POPULATION before tick.ts applies them.
  let projectedCount = store.count;

  for (let i = 0; i < store.count; i++) {
    if (store.resource[i] < REPRODUCTION_THRESHOLD) continue;

    if (projectedCount >= MAX_POPULATION) {
      // At the population cap: a citizen that would otherwise reproduce
      // can't spawn a child, but it also shouldn't accumulate resource
      // without bound forever (it'll keep harvesting up to MAX_INTAKE every
      // tick with nowhere for that resource to go). Clamp at the threshold
      // so "resource" stays a meaningful bounded stat even while capped.
      store.resource[i] = REPRODUCTION_THRESHOLD;
      continue;
    }

    const childResource = store.resource[i] * REPRODUCTION_SPLIT_FRACTION;
    store.resource[i] -= childResource;

    pendingSpawns.push({
      x: store.x[i],
      y: store.y[i],
      heading: store.heading[i],
      resource: childResource,
      // Traits (rule 10): every citizen gets identical fixed values this
      // phase, so inheriting the parent's is equivalent to reading the
      // shared constants — but inheriting keeps this correct automatically
      // if traits ever become variable per-citizen later.
      visionRadius: store.visionRadius[i],
      speed: store.speed[i],
      metabolismRate: store.metabolismRate[i],
    });
    projectedCount++;
  }
}
