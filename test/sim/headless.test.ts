import { describe, expect, it } from "vitest";
import { MAX_POPULATION, REPRODUCTION_THRESHOLD, TERRAIN_BASE_CAPACITY } from "../../src/sim/constants.ts";
import { tick } from "../../src/sim/tick.ts";
import { createWorld } from "../../src/sim/world.ts";

describe("headless simulation", () => {
  it("runs ticks with no rendering involved and keeps world state well-formed", () => {
    const world = createWorld({ seed: 42 });
    expect(world.citizens.count).toBeGreaterThan(0);

    for (let i = 0; i < 200; i++) {
      tick(world);
    }

    expect(world.tick).toBe(200);
    // Population should never exceed the hard cap.
    expect(world.citizens.count).toBeLessThanOrEqual(MAX_POPULATION);
    // Population shouldn't have gone fully extinct on a fertile default map.
    expect(world.citizens.count).toBeGreaterThan(0);
  });

  it("keeps terrain resource within [0, capacity] at every cell", () => {
    const world = createWorld({ seed: 7 });
    for (let i = 0; i < 100; i++) tick(world);

    const { resource, capacity, isWater } = world.terrain;
    for (let i = 0; i < resource.length; i++) {
      expect(resource[i]).toBeGreaterThanOrEqual(0);
      expect(resource[i]).toBeLessThanOrEqual(capacity[i]);
      // Every cell shares the uniform base capacity, except a pond cell —
      // generatePonds deliberately zeroes both (see sim/terrain.ts) so
      // nothing grows in the water.
      expect(capacity[i]).toBe(isWater[i] ? 0 : TERRAIN_BASE_CAPACITY);
    }
  });

  it("keeps idToSlot in sync with the dense store after many deaths/spawns", () => {
    const world = createWorld({ seed: 99, initialPopulation: 80 });
    for (let i = 0; i < 300; i++) tick(world);

    expect(world.citizens.idToSlot.size).toBe(world.citizens.count);
    for (let slot = 0; slot < world.citizens.count; slot++) {
      const id = world.citizens.id[slot];
      expect(world.citizens.idToSlot.get(id)).toBe(slot);
    }
  });

  it("never lets a citizen's resource go negative across a full run", () => {
    const world = createWorld({ seed: 123 });
    for (let i = 0; i < 150; i++) {
      tick(world);
      for (let slot = 0; slot < world.citizens.count; slot++) {
        expect(world.citizens.resource[slot]).toBeGreaterThan(0);
      }
    }
  });

  it("bounds population by ecological scarcity rather than the MAX_POPULATION rail", () => {
    const world = createWorld({ seed: 5, initialPopulation: 50 });
    for (let i = 0; i < 500; i++) tick(world);

    // This assertion is deliberately the inverse of what it used to be. The
    // old test asserted the population reached MAX_POPULATION exactly — the
    // world saturating at the cap and sitting there. That state is actively
    // anti-evolutionary: at the cap, reproduction.ts skips reproduction and
    // clamps resource, so the fittest citizen cannot out-reproduce the least
    // fit and selection switches off entirely. MAX_POPULATION is now a
    // safety rail sized well above the food supply's carrying capacity, and
    // scarcity is what's supposed to bound growth.
    expect(world.citizens.count).toBeGreaterThan(50); // scarcity isn't so harsh nothing survives
    expect(world.citizens.count).toBeLessThan(MAX_POPULATION); // ...but ecology, not the rail, is the ceiling

    // Still true, and still worth guarding: harvest runs before reproduction
    // within a tick, so any citizen over the threshold reproduces (halving
    // its resource) in the same tick rather than accumulating without bound.
    for (let slot = 0; slot < world.citizens.count; slot++) {
      expect(world.citizens.resource[slot]).toBeLessThanOrEqual(REPRODUCTION_THRESHOLD);
    }
  });
});
