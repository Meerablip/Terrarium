import { describe, expect, it } from "vitest";
import { createWorld } from "../../src/sim/world.ts";
import { tick } from "../../src/sim/tick.ts";
import { deserializeWorld, serializeWorld } from "../../src/server/persistence/serialization.ts";

/** Deep-compares two Worlds field by field, in a way that's meaningful for
 * typed arrays / Maps / Sets (structural equality, not reference equality). */
function expectWorldsEqual(a: ReturnType<typeof createWorld>, b: ReturnType<typeof createWorld>) {
  expect(b.tick).toBe(a.tick);
  expect(b.rng.getState()).toBe(a.rng.getState());

  // Terrain
  expect(Array.from(b.terrain.resource)).toEqual(Array.from(a.terrain.resource));
  expect(Array.from(b.terrain.capacity)).toEqual(Array.from(a.terrain.capacity));
  expect(Array.from(b.terrain.pathWear)).toEqual(Array.from(a.terrain.pathWear));
  expect(b.terrain.cols).toBe(a.terrain.cols);
  expect(b.terrain.rows).toBe(a.terrain.rows);
  expect(b.terrain.cellSize).toBe(a.terrain.cellSize);

  // Citizens
  expect(b.citizens.count).toBe(a.citizens.count);
  expect(b.citizens.nextEntityId).toBe(a.citizens.nextEntityId);
  expect(Array.from(b.citizens.id.slice(0, b.citizens.count))).toEqual(
    Array.from(a.citizens.id.slice(0, a.citizens.count)),
  );
  for (const field of ["x", "y", "heading", "resource", "age", "visionRadius", "speed", "metabolismRate",
    "carryingKind", "carryingQty", "activity", "hasHome", "homeId"] as const) {
    expect(Array.from(b.citizens[field].slice(0, b.citizens.count)), `field ${field}`).toEqual(
      Array.from(a.citizens[field].slice(0, a.citizens.count)),
    );
  }
  // idToSlot rebuilt correctly
  expect(b.citizens.idToSlot.size).toBe(b.citizens.count);
  for (let slot = 0; slot < b.citizens.count; slot++) {
    expect(b.citizens.idToSlot.get(b.citizens.id[slot])).toBe(slot);
  }

  // Materials
  expect(b.materials.count).toBe(a.materials.count);
  expect(Array.from(b.materials.fields.quantity.slice(0, b.materials.count))).toEqual(
    Array.from(a.materials.fields.quantity.slice(0, a.materials.count)),
  );
  expect(b.materials.idToSlot.size).toBe(b.materials.count);

  // Homes
  expect(b.homes.homes.size).toBe(a.homes.homes.size);
  expect(b.homes.nextHomeId).toBe(a.homes.nextHomeId);
  for (const [id, rec] of a.homes.homes) {
    const other = b.homes.homes.get(id);
    expect(other).toBeDefined();
    expect(other!.buildProgress).toBe(rec.buildProgress);
    expect(other!.complete).toBe(rec.complete);
    expect([...other!.memberIds].sort()).toEqual([...rec.memberIds].sort());
  }

  // Weather
  expect(b.weather).toEqual(a.weather);

  // Settlements
  expect(b.settlements.settlements.size).toBe(a.settlements.settlements.size);
  expect(b.settlements.nextId).toBe(a.settlements.nextId);
  expect(b.settlements.pendingClusters.size).toBe(a.settlements.pendingClusters.size);
  for (const [id, rec] of a.settlements.settlements) {
    const other = b.settlements.settlements.get(id);
    expect(other).toBeDefined();
    expect(other!.name).toBe(rec.name);
    expect(other!.tier).toBe(rec.tier);
    expect(other!.population).toBe(rec.population);
    expect([...other!.memberCellIndices].sort()).toEqual([...rec.memberCellIndices].sort());
  }
}

describe("snapshot serialization round-trip", () => {
  it("round-trips a freshly-created world exactly", () => {
    const world = createWorld({ seed: 7 });
    const snap = serializeWorld(world);
    const restored = deserializeWorld(snap);
    expectWorldsEqual(world, restored);
  });

  it("round-trips a world with hundreds of ticks of accumulated state (homes, settlements, deaths, spawns)", () => {
    const world = createWorld({ seed: 99, initialPopulation: 60 });
    for (let i = 0; i < 500; i++) tick(world);

    const snap = serializeWorld(world);
    const restored = deserializeWorld(snap);
    expectWorldsEqual(world, restored);

    // Sanity: this run should actually have produced nontrivial state, or
    // the equality checks above would be trivially vacuous.
    expect(world.citizens.count).toBeGreaterThan(0);
  });

  it("survives an actual JSON.stringify/JSON.parse round trip (proves it's genuinely JSON-safe, not just structurally comparable in-memory)", () => {
    const world = createWorld({ seed: 3, initialPopulation: 40 });
    for (let i = 0; i < 200; i++) tick(world);

    const snap = serializeWorld(world);
    const jsonRoundTripped = JSON.parse(JSON.stringify(snap));
    const restored = deserializeWorld(jsonRoundTripped);
    expectWorldsEqual(world, restored);
  });

  it("resumes ticking identically after a round trip (the actual guarantee that matters for restart correctness)", () => {
    const worldA = createWorld({ seed: 55, initialPopulation: 30 });
    for (let i = 0; i < 100; i++) tick(worldA);

    const snap = serializeWorld(worldA);
    const worldB = deserializeWorld(JSON.parse(JSON.stringify(snap)));

    // Advance both worlds identically from this point and confirm they stay in lockstep.
    for (let i = 0; i < 50; i++) {
      tick(worldA);
      tick(worldB);
    }
    expectWorldsEqual(worldA, worldB);
  });

  it("omitted scratch fields (settlementCellPopScratch, terrain.homeBoostScratch) are freshly reallocated at the correct size, not left undefined", () => {
    const world = createWorld({ seed: 1 });
    const restored = deserializeWorld(serializeWorld(world));
    expect(restored.settlementCellPopScratch.length).toBe(world.settlementCellPopScratch.length);
    expect(restored.terrain.homeBoostScratch.length).toBe(world.terrain.resource.length);
  });
});
