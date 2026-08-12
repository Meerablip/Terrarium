// Generic SoA (structure-of-arrays) entity store factory. Generalizes the
// dense/swap-remove pattern that used to be hand-written per-field in
// store.ts (see git history / the MVP) into a schema-driven factory so
// adding a new entity kind (Material, and whatever comes after it) is a new
// schema object plus a few thin wrapper functions, not a hand-copied file.
//
// Semantics are identical to the original hand-rolled CitizenStore:
// entities are packed DENSELY (store.count live entities occupy slots
// [0, count) with no gaps); death is swap-remove (the last live slot's data
// is copied into the removed slot, count--), which keeps every system's hot
// loop branch-free. Slot indices are UNSTABLE across a tick — callers must
// always resolve "the same entity" via the stable, monotonically-assigned
// EntityId through idToSlot, never by caching a slot index.

import type { EntityId } from "../../types.ts";

export type TypedArrayCtor =
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor;

export type Schema = Record<string, TypedArrayCtor>;

type FieldsOf<S extends Schema> = { [K in keyof S]: InstanceType<S[K]> };

export interface SoAStore<S extends Schema> {
  capacity: number;
  /** Number of live entities; also the number of in-use slots (dense, no gaps). */
  count: number;
  fields: FieldsOf<S>;
  /** Stable entity id currently occupying each slot. */
  id: Uint32Array;
  /** Stable entity id -> current slot index. The only supported way to find
   * an entity by id; slot indices themselves are not stable across ticks. */
  idToSlot: Map<EntityId, number>;
  /** Internal: next id to hand out. Monotonic, never reused. */
  nextEntityId: number;
  schema: S;
}

function allocField(ctor: TypedArrayCtor, length: number) {
  return new ctor(length);
}

export function createSoAStore<S extends Schema>(schema: S, initialCapacity: number): SoAStore<S> {
  const fields = {} as FieldsOf<S>;
  for (const key of Object.keys(schema) as (keyof S)[]) {
    fields[key] = allocField(schema[key], initialCapacity) as FieldsOf<S>[keyof S];
  }
  return {
    capacity: initialCapacity,
    count: 0,
    fields,
    id: new Uint32Array(initialCapacity),
    idToSlot: new Map(),
    nextEntityId: 1,
    schema,
  };
}

/** Doubles every field array's backing storage, preserving existing data. */
export function growStore<S extends Schema>(store: SoAStore<S>): void {
  const newCapacity = store.capacity * 2;
  for (const key of Object.keys(store.schema) as (keyof S)[]) {
    const ctor = store.schema[key];
    const old = store.fields[key] as InstanceType<TypedArrayCtor>;
    const next = new ctor(newCapacity);
    next.set(old);
    store.fields[key] = next as FieldsOf<S>[keyof S];
  }
  const nextId = new Uint32Array(newCapacity);
  nextId.set(store.id);
  store.id = nextId;
  store.capacity = newCapacity;
}

function growIfNeeded<S extends Schema>(store: SoAStore<S>): void {
  if (store.count < store.capacity) return;
  growStore(store);
}

/** Appends a new entity at the end of the dense range. Returns its stable id. */
export function spawnEntity<S extends Schema>(
  store: SoAStore<S>,
  values: { [K in keyof S]: number },
): EntityId {
  growIfNeeded(store);
  const slot = store.count;
  const id = store.nextEntityId++;

  for (const key of Object.keys(store.schema) as (keyof S)[]) {
    (store.fields[key] as InstanceType<TypedArrayCtor>)[slot] = values[key];
  }
  store.id[slot] = id;

  store.idToSlot.set(id, slot);
  store.count++;
  return id;
}

/** Removes the entity at `slot` via swap-remove with the last live slot. */
export function killAtSlot<S extends Schema>(store: SoAStore<S>, slot: number): void {
  const lastSlot = store.count - 1;
  const deadId = store.id[slot];
  store.idToSlot.delete(deadId);

  if (slot !== lastSlot) {
    const movedId = store.id[lastSlot];
    for (const key of Object.keys(store.schema) as (keyof S)[]) {
      const arr = store.fields[key] as InstanceType<TypedArrayCtor>;
      arr[slot] = arr[lastSlot];
    }
    store.id[slot] = movedId;
    store.idToSlot.set(movedId, slot);
  }

  store.count--;
}

/** Convenience: kill by stable entity id rather than slot index. */
export function killById<S extends Schema>(store: SoAStore<S>, id: EntityId): void {
  const slot = store.idToSlot.get(id);
  if (slot !== undefined) killAtSlot(store, slot);
}
