import { describe, expect, it } from "vitest";
import {
  GRID_COLS,
  GRID_ROWS,
  SETTLEMENT_DISSOLVE_GRACE_TICKS,
  SETTLEMENT_FOUND_THRESHOLD_TICKS,
  TIER_CITY_MIN,
  TIER_HUT_MIN,
  TIER_VILLAGE_MIN,
} from "../../src/sim/constants.ts";
import { createHomeRegistry } from "../../src/sim/homes.ts";
import { createSettlementRegistry, updateSettlementRegistry } from "../../src/sim/systems/settlements.ts";
import { createCitizenStore, killAtSlot, spawnCitizen } from "../../src/sim/ecs/store.ts";
import { createDefaultTerrain } from "../../src/sim/terrain.ts";
import { createRng } from "../../src/sim/rng.ts";

function placeCitizensAt(count: number, x: number, y: number) {
  const citizens = createCitizenStore(Math.max(count, 4));
  for (let i = 0; i < count; i++) {
    spawnCitizen(citizens, x + (i % 3), y + Math.floor(i / 3), 0, 10);
  }
  return citizens;
}

describe("settlement tier classifier + registry", () => {
  it("classifies clusters into hut/village/city tiers at the exact threshold boundaries", () => {
    const rng = createRng(1);
    const terrain = createDefaultTerrain(rng);
    const homes = createHomeRegistry();
    const scratch = new Uint16Array(GRID_COLS * GRID_ROWS);

    const cases: [number, string | undefined][] = [
      [TIER_HUT_MIN - 1, undefined],
      [TIER_HUT_MIN, "hut"],
      [TIER_VILLAGE_MIN - 1, "hut"],
      [TIER_VILLAGE_MIN, "village"],
      [TIER_CITY_MIN - 1, "village"],
      [TIER_CITY_MIN, "city"],
    ];

    for (const [population, expectedTier] of cases) {
      const registry = createSettlementRegistry();
      const citizens = placeCitizensAt(population, 200, 200);

      // Fast-forward past the founding threshold by calling the update
      // repeatedly with the same stable cluster.
      for (let i = 0; i < SETTLEMENT_FOUND_THRESHOLD_TICKS; i++) {
        updateSettlementRegistry(registry, citizens, homes, terrain, i, rng, scratch);
      }

      if (expectedTier === undefined) {
        expect(registry.settlements.size).toBe(0);
      } else {
        expect(registry.settlements.size).toBe(1);
        const record = [...registry.settlements.values()][0];
        expect(record.tier).toBe(expectedTier);
      }
    }
  });

  it("does not register a settlement before SETTLEMENT_FOUND_THRESHOLD_TICKS, registers exactly at it", () => {
    const rng = createRng(2);
    const terrain = createDefaultTerrain(rng);
    const homes = createHomeRegistry();
    const scratch = new Uint16Array(GRID_COLS * GRID_ROWS);
    const registry = createSettlementRegistry();
    const citizens = placeCitizensAt(TIER_HUT_MIN + 2, 300, 300);

    for (let i = 0; i < SETTLEMENT_FOUND_THRESHOLD_TICKS - 1; i++) {
      updateSettlementRegistry(registry, citizens, homes, terrain, i, rng, scratch);
    }
    expect(registry.settlements.size).toBe(0);

    updateSettlementRegistry(registry, citizens, homes, terrain, SETTLEMENT_FOUND_THRESHOLD_TICKS - 1, rng, scratch);
    expect(registry.settlements.size).toBe(1);
    const record = [...registry.settlements.values()][0];
    expect(record.foundingTick).toBe(SETTLEMENT_FOUND_THRESHOLD_TICKS - 1);
  });

  it("dissolves a registered settlement after sustained grace-period depopulation, and cancels on recovery", () => {
    const rng = createRng(3);
    const terrain = createDefaultTerrain(rng);
    const homes = createHomeRegistry();
    const scratch = new Uint16Array(GRID_COLS * GRID_ROWS);
    const registry = createSettlementRegistry();
    const citizens = placeCitizensAt(TIER_HUT_MIN + 3, 400, 400);

    let t = 0;
    for (; t < SETTLEMENT_FOUND_THRESHOLD_TICKS; t++) {
      updateSettlementRegistry(registry, citizens, homes, terrain, t, rng, scratch);
    }
    expect(registry.settlements.size).toBe(1);

    // Depopulate below TIER_HUT_MIN.
    while (citizens.count >= TIER_HUT_MIN) {
      killAtSlot(citizens, 0);
    }

    // Run partway through the grace period, then repopulate — should cancel dissolve.
    for (let i = 0; i < SETTLEMENT_DISSOLVE_GRACE_TICKS - 1; i++) {
      t++;
      updateSettlementRegistry(registry, citizens, homes, terrain, t, rng, scratch);
    }
    expect(registry.settlements.size).toBe(1); // still alive, grace not exhausted

    for (let i = 0; i < TIER_HUT_MIN + 3; i++) {
      spawnCitizen(citizens, 400 + (i % 3), 400 + Math.floor(i / 3), 0, 10);
    }
    t++;
    updateSettlementRegistry(registry, citizens, homes, terrain, t, rng, scratch);
    const recovered = [...registry.settlements.values()][0];
    expect(recovered.graceTicksRemaining).toBeNull();

    // Now actually let it dissolve: depopulate and run the full grace period.
    while (citizens.count >= TIER_HUT_MIN) {
      killAtSlot(citizens, 0);
    }
    for (let i = 0; i < SETTLEMENT_DISSOLVE_GRACE_TICKS + 1; i++) {
      t++;
      updateSettlementRegistry(registry, citizens, homes, terrain, t, rng, scratch);
    }
    expect(registry.settlements.size).toBe(0);
  });
});
