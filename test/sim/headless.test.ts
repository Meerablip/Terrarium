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

    const { resource, capacity } = world.terrain;
    for (let i = 0; i < resource.length; i++) {
      expect(resource[i]).toBeGreaterThanOrEqual(0);
      expect(resource[i]).toBeLessThanOrEqual(capacity[i]);
      expect(capacity[i]).toBe(TERRAIN_BASE_CAPACITY);
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

  it("clamps resource at the reproduction threshold once population is capped, instead of growing unbounded", () => {
    const world = createWorld({ seed: 5, initialPopulation: 50 });
    for (let i = 0; i < 500; i++) tick(world);

    expect(world.citizens.count).toBe(MAX_POPULATION);
    for (let slot = 0; slot < world.citizens.count; slot++) {
      expect(world.citizens.resource[slot]).toBeLessThanOrEqual(REPRODUCTION_THRESHOLD);
    }
  });
});
