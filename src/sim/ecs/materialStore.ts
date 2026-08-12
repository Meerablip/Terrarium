// Discrete Material entities (Phase 2, rule 3): raw-material deposits
// scattered at world-gen time. Built on the same generic SoA factory as
// CitizenStore — materials use the same dense/swap-remove treatment since
// gathering can fully deplete and remove a node mid-run.
//
// `kind` is a plain integer index into a MATERIAL_KIND_COUNT-sized space
// (0=wood, 1=stone, ...). Nothing in gather/haul/deposit logic should ever
// switch on a specific kind value — only render-side color lookup does, via
// an array index (MATERIAL_KIND_COLORS[kind]), never a branch — so adding a
// third kind later is a constant bump plus one more color, not a logic change.

import type { EntityId } from "../../types.ts";
import { createSoAStore, killAtSlot as genericKillAtSlot, spawnEntity, type SoAStore } from "./soaStore.ts";

const MATERIAL_SCHEMA = {
  x: Float32Array,
  y: Float32Array,
  kind: Int32Array,
  quantity: Float32Array,
} as const;

export type MaterialStore = SoAStore<typeof MATERIAL_SCHEMA>;

export function createMaterialStore(initialCapacity: number): MaterialStore {
  return createSoAStore(MATERIAL_SCHEMA, initialCapacity);
}

export function spawnMaterial(store: MaterialStore, x: number, y: number, kind: number, quantity: number): EntityId {
  return spawnEntity(store, { x, y, kind, quantity });
}

/** Removes up to `amount` from the node at `slot`, clamped at 0. Returns the
 * amount actually removed (may be less than requested if the node ran out).
 * Does NOT remove the node itself even if it hits zero — callers must check
 * `store.fields.quantity[slot] <= 0` and defer a kill (see tick.ts's
 * pendingMaterialDepletions), since removing a store entry mid-iteration is
 * the same swap-remove hazard documented on CitizenStore. */
export function depleteMaterial(store: MaterialStore, slot: number, amount: number): number {
  const available = store.fields.quantity[slot];
  const removed = Math.min(amount, available);
  store.fields.quantity[slot] = available - removed;
  return removed;
}

export function killAtSlot(store: MaterialStore, slot: number): void {
  genericKillAtSlot(store, slot);
}
