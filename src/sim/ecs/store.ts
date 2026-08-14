// CitizenStore, rebuilt on the generic SoA factory (soaStore.ts). Behavior
// and the outward-facing shape are unchanged from the original hand-rolled
// version: dense/swap-remove, idToSlot for stable id lookup, and every
// existing field (x, y, heading, resource, age) still readable directly as
// `citizens.x[slot]` etc. — every pre-Phase-2 call site keeps compiling and
// running unchanged.
//
// How the compatibility shim works: createCitizenStore builds a generic
// SoAStore<CITIZEN_SCHEMA>, then spreads its `fields` onto the top-level
// returned object (`{ ...store, ...store.fields }`). Since typed arrays are
// reference types, `citizens.x` and `citizens.fields.x` are the exact same
// array — mutating through either name mutates the same backing memory. No
// proxy or getter machinery needed.
//
// Two fields are NOT part of the generic schema: memX/memY, the flat
// per-citizen Memory ring buffers (see components.ts). They're each sized
// capacity * MEMORY_CAPACITY (multi-valued per entity), which doesn't fit
// the factory's one-scalar-per-entity-per-field schema shape, so they're
// grown by hand alongside every growStore() call (see growCitizenStore
// below) rather than folding a "field width" concept into the generic
// factory for the sake of this one field.

import type { EntityId } from "../../types.ts";
import { MEMORY_CAPACITY } from "../constants.ts";
import {
  createSoAStore,
  growStore,
  killAtSlot as genericKillAtSlot,
  spawnEntity,
  type SoAStore,
} from "./soaStore.ts";

const CITIZEN_SCHEMA = {
  x: Float32Array,
  y: Float32Array,
  heading: Float32Array,
  resource: Float32Array,
  age: Uint32Array,

  // Genome (see ../traits.ts). visionRadius/speed are heritable and mutate on
  // reproduction; metabolismRate is DERIVED from them and cached here so the
  // hot metabolism loop reads a flat array instead of recomputing a cost
  // function for every citizen every tick.
  visionRadius: Float32Array,
  speed: Float32Array,
  metabolismRate: Float32Array,

  // Lineage. Not read by any simulation rule — this is telemetry, and it's
  // load-bearing for exactly one thing: being able to tell real adaptation
  // apart from neutral drift. Without generation/birthTick you cannot plot a
  // trait mean against generation number, and "is it evolving?" stays an
  // opinion rather than a measurement.
  generation: Uint32Array, // 0 for founding citizens, parent's + 1 otherwise
  birthTick: Uint32Array,
  parentId: Int32Array, // -1 for founding citizens

  // Decide/Move cache: this tick's chosen destination (distinct from Memory,
  // which is *remembered past payoffs* — see components.ts).
  targetX: Float32Array,
  targetY: Float32Array,
  hasTarget: Uint8Array,
  decideCountdown: Uint32Array,

  // Home link.
  homeX: Float32Array,
  homeY: Float32Array,
  hasHome: Uint8Array,
  homeId: Uint32Array,

  // Carrying (separate pool from `resource` — inert cargo, no metabolic effect).
  carryingKind: Int32Array, // -1 = not carrying anything
  carryingQty: Float32Array,

  // Material gather/haul state machine.
  activity: Uint8Array, // 0=FORAGE 1=SEEK_MATERIAL 2=GATHERING 3=HAULING_HOME
  gatherCountdown: Uint32Array,

  // Memory bookkeeping (memX/memY arrays themselves are grown by hand, below).
  memCount: Uint8Array,
  memWriteIdx: Uint8Array,
} as const;

type CitizenSoAStore = SoAStore<typeof CITIZEN_SCHEMA>;

export type CitizenStore = CitizenSoAStore &
  CitizenSoAStore["fields"] & {
    /** Flat ring-buffer of remembered payoff-location X coords, length capacity*MEMORY_CAPACITY. */
    memX: Float32Array;
    /** Flat ring-buffer of remembered payoff-location Y coords, length capacity*MEMORY_CAPACITY. */
    memY: Float32Array;
  };

function attachFlattenedFields(store: CitizenSoAStore, memX: Float32Array, memY: Float32Array): CitizenStore {
  return Object.assign(store, store.fields, { memX, memY }) as CitizenStore;
}

export function createCitizenStore(initialCapacity: number): CitizenStore {
  const store = createSoAStore(CITIZEN_SCHEMA, initialCapacity);
  const memX = new Float32Array(initialCapacity * MEMORY_CAPACITY);
  const memY = new Float32Array(initialCapacity * MEMORY_CAPACITY);
  return attachFlattenedFields(store, memX, memY);
}

function growMemoryArrays(store: CitizenStore): void {
  const newLength = store.capacity * MEMORY_CAPACITY; // store.capacity already doubled by growStore
  const nextMemX = new Float32Array(newLength);
  nextMemX.set(store.memX);
  const nextMemY = new Float32Array(newLength);
  nextMemY.set(store.memY);
  store.memX = nextMemX;
  store.memY = nextMemY;
}

/** Appends a new citizen at the end of the dense range. Returns its stable id.
 * Same signature as the MVP's original spawnCitizen — new Phase 2 fields get
 * sane defaults (Traits from the passed-in constants, everything else zeroed
 * or flagged "unset"). */
export function spawnCitizen(
  store: CitizenStore,
  x: number,
  y: number,
  heading: number,
  resource: number,
  traits?: { visionRadius: number; speed: number; metabolismRate: number },
  lineage?: { generation: number; birthTick: number; parentId: number },
): EntityId {
  const wasAtCapacity = store.count >= store.capacity;
  const id = spawnEntity(store, {
    x,
    y,
    heading,
    resource,
    age: 0,
    visionRadius: traits?.visionRadius ?? 0,
    speed: traits?.speed ?? 0,
    metabolismRate: traits?.metabolismRate ?? 0,
    generation: lineage?.generation ?? 0,
    birthTick: lineage?.birthTick ?? 0,
    // -1 ("no parent") is the meaningful default: a citizen spawned without
    // explicit lineage is a founder, not the child of entity 0.
    parentId: lineage?.parentId ?? -1,
    targetX: 0,
    targetY: 0,
    hasTarget: 0,
    decideCountdown: 0,
    homeX: 0,
    homeY: 0,
    hasHome: 0,
    homeId: 0,
    carryingKind: -1,
    carryingQty: 0,
    activity: 0,
    gatherCountdown: 0,
    memCount: 0,
    memWriteIdx: 0,
  });

  if (wasAtCapacity) {
    // growStore() (called inside spawnEntity via growIfNeeded) already
    // doubled store.capacity and every schema field; the memX/memY arrays
    // are outside the schema, so they need the same doubling here.
    growMemoryArrays(store);
  }

  // Re-attach flattened top-level references — growStore() replaced the
  // underlying field arrays with new (larger) ones, so the top-level
  // aliases set by attachFlattenedFields at construction time would
  // otherwise go stale.
  Object.assign(store, store.fields);

  return id;
}

/** Removes the citizen at `slot` via swap-remove with the last live slot. */
export function killAtSlot(store: CitizenStore, slot: number): void {
  const lastSlot = store.count - 1;
  if (slot !== lastSlot) {
    // Swap-remove the two out-of-schema memory ring buffers in lockstep with
    // the generic factory's swap-remove of every schema field, so a
    // citizen's memories move with it when it gets relocated to a lower slot.
    const memBase = MEMORY_CAPACITY;
    for (let i = 0; i < memBase; i++) {
      store.memX[slot * memBase + i] = store.memX[lastSlot * memBase + i];
      store.memY[slot * memBase + i] = store.memY[lastSlot * memBase + i];
    }
  }
  genericKillAtSlot(store, slot);
}

/** Convenience: kill by stable entity id rather than slot index. */
export function killById(store: CitizenStore, id: EntityId): void {
  const slot = store.idToSlot.get(id);
  if (slot !== undefined) killAtSlot(store, slot);
}

// growStore is re-exported only for tests that want to exercise growth
// directly; CitizenStore consumers should never need to call it themselves
// (spawnCitizen handles growth internally, including the memX/memY arrays).
export { growStore as growCitizenStoreFieldsOnly };
