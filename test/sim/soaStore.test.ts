import { describe, expect, it } from "vitest";
import { createSoAStore, growStore, killAtSlot, spawnEntity } from "../../src/sim/ecs/soaStore.ts";
import { createCitizenStore, killAtSlot as killCitizenAtSlot, spawnCitizen } from "../../src/sim/ecs/store.ts";
import { MEMORY_CAPACITY } from "../../src/sim/constants.ts";

describe("generic SoA store factory", () => {
  it("spawns entities densely and grows backing arrays on overflow, preserving data", () => {
    const schema = { x: Float32Array, y: Float32Array } as const;
    const store = createSoAStore(schema, 2);

    const a = spawnEntity(store, { x: 1, y: 10 });
    const b = spawnEntity(store, { x: 2, y: 20 });
    expect(store.capacity).toBe(2);

    // Third spawn should trigger growth.
    const c = spawnEntity(store, { x: 3, y: 30 });
    expect(store.capacity).toBeGreaterThan(2);
    expect(store.count).toBe(3);

    // Old data preserved after growth.
    expect(store.fields.x[store.idToSlot.get(a)!]).toBe(1);
    expect(store.fields.x[store.idToSlot.get(b)!]).toBe(2);
    expect(store.fields.x[store.idToSlot.get(c)!]).toBe(3);
  });

  it("swap-removes correctly, updating idToSlot for the moved entity", () => {
    const schema = { x: Float32Array } as const;
    const store = createSoAStore(schema, 8);
    const a = spawnEntity(store, { x: 1 });
    const b = spawnEntity(store, { x: 2 });
    const c = spawnEntity(store, { x: 3 });

    const slotA = store.idToSlot.get(a)!;
    killAtSlot(store, slotA); // remove first entity, last (c) should move into its slot

    expect(store.count).toBe(2);
    expect(store.idToSlot.has(a)).toBe(false);
    expect(store.idToSlot.get(c)).toBe(slotA);
    expect(store.fields.x[slotA]).toBe(3);
    expect(store.idToSlot.get(b)).toBeDefined();
  });

  it("growStore doubles capacity and preserves all field arrays", () => {
    const schema = { a: Uint32Array, b: Int32Array } as const;
    const store = createSoAStore(schema, 4);
    spawnEntity(store, { a: 5, b: -5 });
    growStore(store);
    expect(store.capacity).toBe(8);
    expect(store.fields.a[0]).toBe(5);
    expect(store.fields.b[0]).toBe(-5);
  });
});

describe("CitizenStore compatibility shim", () => {
  it("keeps top-level field access (citizens.x) identical to citizens.fields.x", () => {
    const citizens = createCitizenStore(4);
    const id = spawnCitizen(citizens, 10, 20, 0, 50);
    const slot = citizens.idToSlot.get(id)!;

    expect(citizens.x[slot]).toBe(10);
    expect(citizens.fields.x[slot]).toBe(10);
    expect(citizens.x).toBe(citizens.fields.x); // same array reference

    citizens.x[slot] = 99;
    expect(citizens.fields.x[slot]).toBe(99); // mutation through either name affects the same memory
  });

  it("keeps top-level references valid after growth-triggering spawns", () => {
    const citizens = createCitizenStore(2);
    spawnCitizen(citizens, 0, 0, 0, 10);
    spawnCitizen(citizens, 0, 0, 0, 10);
    const id3 = spawnCitizen(citizens, 5, 5, 0, 10); // triggers growth

    expect(citizens.capacity).toBeGreaterThan(2);
    const slot3 = citizens.idToSlot.get(id3)!;
    expect(citizens.x[slot3]).toBe(5); // top-level alias still points at the current (grown) array
    expect(citizens.x).toBe(citizens.fields.x);
  });

  it("grows the out-of-schema memX/memY arrays in lockstep with the rest of the store", () => {
    const citizens = createCitizenStore(2);
    spawnCitizen(citizens, 0, 0, 0, 10);
    spawnCitizen(citizens, 0, 0, 0, 10);
    expect(citizens.memX.length).toBe(2 * MEMORY_CAPACITY);

    spawnCitizen(citizens, 0, 0, 0, 10); // triggers growth
    expect(citizens.memX.length).toBe(citizens.capacity * MEMORY_CAPACITY);
    expect(citizens.memY.length).toBe(citizens.capacity * MEMORY_CAPACITY);
  });

  it("swap-removes memory ring buffers alongside the rest of a citizen's data", () => {
    const citizens = createCitizenStore(8);
    const a = spawnCitizen(citizens, 0, 0, 0, 10);
    spawnCitizen(citizens, 0, 0, 0, 10);
    const c = spawnCitizen(citizens, 0, 0, 0, 10);

    const slotC = citizens.idToSlot.get(c)!;
    citizens.memX[slotC * MEMORY_CAPACITY] = 123;
    citizens.memY[slotC * MEMORY_CAPACITY] = 456;

    const slotA = citizens.idToSlot.get(a)!;
    killCitizenAtSlot(citizens, slotA); // swap-removes a; c (last) should move into slotA

    const newSlotC = citizens.idToSlot.get(c)!;
    expect(newSlotC).toBe(slotA);
    expect(citizens.memX[newSlotC * MEMORY_CAPACITY]).toBe(123);
    expect(citizens.memY[newSlotC * MEMORY_CAPACITY]).toBe(456);
  });
});
