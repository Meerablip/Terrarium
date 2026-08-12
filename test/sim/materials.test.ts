import { describe, expect, it } from "vitest";
import {
  FORAGE_SURPLUS_THRESHOLD,
  MATERIAL_CARRY_CAPACITY,
  MATERIAL_GATHER_TICKS,
} from "../../src/sim/constants.ts";
import { ACTIVITY_FORAGE, ACTIVITY_GATHERING, ACTIVITY_SEEK_MATERIAL } from "../../src/sim/ecs/components.ts";
import { spawnCitizen } from "../../src/sim/ecs/store.ts";
import { spawnMaterial } from "../../src/sim/ecs/materialStore.ts";
import { createWorld } from "../../src/sim/world.ts";
import { tick } from "../../src/sim/tick.ts";

/** Builds a minimal world with citizens/materials cleared, then places
 * exactly one citizen and one material node at controlled positions — makes
 * the gather/haul state machine assertions deterministic instead of
 * dependent on where world-gen happened to scatter things. */
function worldWithOneCitizenAndOneMaterial(distance: number) {
  const world = createWorld({ seed: 42, initialPopulation: 0 });
  world.materials.count = 0; // clear world-gen materials for a controlled scenario
  world.materials.idToSlot.clear();

  const materialId = spawnMaterial(world.materials, 100 + distance, 100, 0, 50);
  const citizenId = spawnCitizen(world.citizens, 100, 100, 0, FORAGE_SURPLUS_THRESHOLD + 10, {
    visionRadius: 999, // ensure the material is always "in range" regardless of VISION_RADIUS tuning
    speed: 20,
    metabolismRate: 0, // isolate this test from metabolism/death timing
  });

  return { world, citizenId, materialId };
}

describe("material gather/haul", () => {
  it("transitions a surplus-resource citizen from foraging to seeking material", () => {
    // Distance deliberately exceeds the citizen's speed (20) so a single
    // tick's movement can't also reach the node and get fast-forwarded
    // straight past SEEK_MATERIAL into GATHERING within the same tick.
    const { world, citizenId } = worldWithOneCitizenAndOneMaterial(100);
    tick(world); // first tick should trigger decide (countdown starts at 0 for a hand-spawned citizen)

    const slot = world.citizens.idToSlot.get(citizenId)!;
    expect(world.citizens.activity[slot]).toBe(ACTIVITY_SEEK_MATERIAL);
  });

  it("gathers on arrival, then hauls carried material home and deposits it", () => {
    const { world, citizenId, materialId } = worldWithOneCitizenAndOneMaterial(5);

    // Run enough ticks to cover: decide -> travel -> arrival -> full gather countdown -> travel home -> deposit.
    let sawGathering = false;
    let sawCarrying = false;
    for (let i = 0; i < MATERIAL_GATHER_TICKS + 50; i++) {
      tick(world);
      const slot = world.citizens.idToSlot.get(citizenId);
      if (slot === undefined) break;
      if (world.citizens.activity[slot] === ACTIVITY_GATHERING) sawGathering = true;
      if (world.citizens.carryingQty[slot] > 0) sawCarrying = true;
    }

    expect(sawGathering).toBe(true);
    expect(sawCarrying).toBe(true);

    const finalSlot = world.citizens.idToSlot.get(citizenId)!;
    // Cargo should have been deposited by the end (back to 0, activity back to FORAGE).
    expect(world.citizens.carryingQty[finalSlot]).toBe(0);
    expect(world.citizens.activity[finalSlot]).toBe(ACTIVITY_FORAGE);

    // A home should now exist with buildProgress > 0.
    expect(world.homes.homes.size).toBeGreaterThan(0);
    const home = [...world.homes.homes.values()][0];
    expect(home.buildProgress).toBeGreaterThan(0);

    // The material node should have lost quantity (or been removed if fully depleted).
    const materialSlot = world.materials.idToSlot.get(materialId);
    if (materialSlot !== undefined) {
      expect(world.materials.fields.quantity[materialSlot]).toBeLessThan(50);
    } else {
      expect(materialSlot).toBeUndefined(); // fully depleted and removed — also valid
    }
  });

  it("caps a single gather at MATERIAL_CARRY_CAPACITY even from an abundant node", () => {
    const { world, citizenId } = worldWithOneCitizenAndOneMaterial(3);
    // Overwrite with an abundant node so the cap, not the node's quantity, is the binding constraint.
    world.materials.fields.quantity[0] = 9999;

    let maxCarried = 0;
    for (let i = 0; i < MATERIAL_GATHER_TICKS + 20; i++) {
      tick(world);
      const slot = world.citizens.idToSlot.get(citizenId);
      if (slot === undefined) break;
      maxCarried = Math.max(maxCarried, world.citizens.carryingQty[slot]);
    }

    expect(maxCarried).toBeLessThanOrEqual(MATERIAL_CARRY_CAPACITY);
    expect(maxCarried).toBeGreaterThan(0);
  });
});
