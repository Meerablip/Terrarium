// World <-> SnapshotV1 conversion. serializeWorld turns the live, typed-array-
// and Map/Set-backed World into a plain JSON-safe object for SQLite storage;
// deserializeWorld does the reverse. deserializeWorld always operates on
// current-version (SnapshotV1) data — any version bridging happens strictly
// inside the migration chain (../migrations/) before this file is ever
// called, so this file never needs to reason about old shapes.

import { GRID_COLS, GRID_ROWS } from "../../sim/constants.ts";
import { createCitizenStore, type CitizenStore } from "../../sim/ecs/store.ts";
import { createMaterialStore, type MaterialStore } from "../../sim/ecs/materialStore.ts";
import { createRng } from "../../sim/rng.ts";
import type { TerrainGrid } from "../../sim/terrain.ts";
import type { HomeRegistry } from "../../sim/homes.ts";
import type { SettlementRegistry } from "../../sim/systems/settlements.ts";
import type { WeatherState } from "../../sim/weather.ts";
import type { World } from "../../sim/world.ts";
import type { SnapshotV1 } from "./types.ts";

/**
 * Turns a live World into a plain JSON-safe SnapshotV1. Serializes citizen
 * fields via `world.citizens.fields`, never the flattened top-level aliases
 * (`world.citizens.x` etc.) — those are the SAME array references as
 * `.fields.x` (see store.ts's Object.assign flattening shim), so reading
 * through `.fields` is the one unambiguous, non-duplicating source of truth
 * for "what are the schema-defined per-citizen scalars."
 */
export function serializeWorld(world: World): SnapshotV1 {
  const citizenFieldEntries = Object.entries(world.citizens.fields) as [
    keyof SnapshotV1["citizens"]["fields"],
    ArrayLike<number>,
  ][];
  const citizenFields = {} as SnapshotV1["citizens"]["fields"];
  for (const [key, arr] of citizenFieldEntries) {
    citizenFields[key] = Array.from(arr);
  }

  return {
    v: 1,
    tick: world.tick,
    rngState: world.rng.getState(),

    terrain: {
      cols: world.terrain.cols,
      rows: world.terrain.rows,
      cellSize: world.terrain.cellSize,
      resource: Array.from(world.terrain.resource),
      capacity: Array.from(world.terrain.capacity),
      pathWear: Array.from(world.terrain.pathWear),
    },

    citizens: {
      capacity: world.citizens.capacity,
      count: world.citizens.count,
      nextEntityId: world.citizens.nextEntityId,
      id: Array.from(world.citizens.id),
      fields: citizenFields,
      memX: Array.from(world.citizens.memX),
      memY: Array.from(world.citizens.memY),
    },

    materials: {
      capacity: world.materials.capacity,
      count: world.materials.count,
      nextEntityId: world.materials.nextEntityId,
      id: Array.from(world.materials.id),
      fields: {
        x: Array.from(world.materials.fields.x),
        y: Array.from(world.materials.fields.y),
        kind: Array.from(world.materials.fields.kind),
        quantity: Array.from(world.materials.fields.quantity),
      },
    },

    homes: {
      nextHomeId: world.homes.nextHomeId,
      homes: Array.from(world.homes.homes.entries()).map(([id, rec]) => [
        id,
        { ...rec, memberIds: Array.from(rec.memberIds) },
      ]),
    },

    weather: { ...world.weather },

    settlements: {
      nextId: world.settlements.nextId,
      nextPendingId: world.settlements.nextPendingId,
      settlements: Array.from(world.settlements.settlements.entries()).map(([id, rec]) => [
        id,
        { ...rec, memberCellIndices: Array.from(rec.memberCellIndices) },
      ]),
      pendingClusters: Array.from(world.settlements.pendingClusters.entries()),
    },
  };
}

/**
 * Rebuilds a live World from a current-version SnapshotV1. Reconstructs
 * idToSlot (both stores) by iterating id[0..count) — it's never persisted,
 * only derived. Reallocates settlementCellPopScratch and
 * terrain.homeBoostScratch fresh (zero information loss: both are fully
 * rebuilt from other state on every tick/call, never meant to persist).
 */
export function deserializeWorld(snap: SnapshotV1): World {
  const terrain: TerrainGrid = {
    cols: snap.terrain.cols,
    rows: snap.terrain.rows,
    cellSize: snap.terrain.cellSize,
    resource: Float32Array.from(snap.terrain.resource),
    capacity: Float32Array.from(snap.terrain.capacity),
    pathWear: Float32Array.from(snap.terrain.pathWear),
    homeBoostScratch: new Float32Array(snap.terrain.cols * snap.terrain.rows),
  };

  const citizens: CitizenStore = createCitizenStore(snap.citizens.capacity);
  citizens.count = snap.citizens.count;
  citizens.nextEntityId = snap.citizens.nextEntityId;
  citizens.id.set(snap.citizens.id);
  for (const [key, arr] of Object.entries(snap.citizens.fields)) {
    const field = citizens.fields[key as keyof typeof citizens.fields] as unknown as { set(a: ArrayLike<number>): void };
    field.set(arr);
  }
  citizens.memX.set(snap.citizens.memX);
  citizens.memY.set(snap.citizens.memY);
  // Top-level flattened aliases (citizens.x, citizens.y, ...) already point
  // at the same arrays as citizens.fields.x/.y/... (set at construction time
  // by createCitizenStore) — no re-flattening needed since we mutated the
  // arrays in place via .set(), not replaced them.
  citizens.idToSlot.clear();
  for (let slot = 0; slot < citizens.count; slot++) {
    citizens.idToSlot.set(citizens.id[slot], slot);
  }

  const materials: MaterialStore = createMaterialStore(snap.materials.capacity);
  materials.count = snap.materials.count;
  materials.nextEntityId = snap.materials.nextEntityId;
  materials.id.set(snap.materials.id);
  materials.fields.x.set(snap.materials.fields.x);
  materials.fields.y.set(snap.materials.fields.y);
  materials.fields.kind.set(snap.materials.fields.kind);
  materials.fields.quantity.set(snap.materials.fields.quantity);
  materials.idToSlot.clear();
  for (let slot = 0; slot < materials.count; slot++) {
    materials.idToSlot.set(materials.id[slot], slot);
  }

  const homes: HomeRegistry = {
    nextHomeId: snap.homes.nextHomeId,
    homes: new Map(
      snap.homes.homes.map(([id, rec]) => [id, { ...rec, memberIds: new Set(rec.memberIds) }]),
    ),
  };

  const weather: WeatherState = { ...snap.weather };

  const settlements: SettlementRegistry = {
    nextId: snap.settlements.nextId,
    nextPendingId: snap.settlements.nextPendingId,
    settlements: new Map(
      snap.settlements.settlements.map(([id, rec]) => [
        id,
        { ...rec, memberCellIndices: new Set(rec.memberCellIndices) },
      ]),
    ),
    pendingClusters: new Map(snap.settlements.pendingClusters),
  };

  const rng = createRng(0);
  rng.restoreRng(snap.rngState);

  return {
    terrain,
    citizens,
    materials,
    homes,
    weather,
    settlements,
    settlementCellPopScratch: new Uint16Array(GRID_COLS * GRID_ROWS),
    tick: snap.tick,
    rng,
  };
}
