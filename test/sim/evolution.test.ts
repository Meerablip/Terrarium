// Tests for the Phase 3 evolution machinery: mutation, the derived cost
// function, lineage tracking, and the population-level consequences.
//
// The load-bearing test here is "trait variance is non-zero and stays
// non-zero." Before this phase every citizen carried byte-identical traits,
// so the population's standard deviation was exactly 0 — and selection on
// zero variance is a no-op regardless of how strong the selection pressure
// is. Variance is the thing that makes the rest of it meaningful, so it's
// asserted directly rather than inferred from downstream behavior.

import { describe, expect, it } from "vitest";
import {
  METABOLISM_BASE,
  MOVE_SPEED_MAX,
  MOVE_SPEED_MIN,
  SENESCENCE_MAX_MULTIPLIER,
  SENESCENCE_ONSET_TICKS,
  VISION_RADIUS_MAX,
  VISION_RADIUS_MIN,
} from "../../src/sim/constants.ts";
import { senescenceMultiplier } from "../../src/sim/systems/metabolism.ts";
import { createRng } from "../../src/sim/rng.ts";
import { computePopulationStats } from "../../src/sim/stats.ts";
import { deriveMetabolismRate, mutateTraits } from "../../src/sim/traits.ts";
import { tick } from "../../src/sim/tick.ts";
import { createWorld } from "../../src/sim/world.ts";

describe("trait cost function", () => {
  it("charges strictly more for a bigger genome, in both genes", () => {
    const base = { visionRadius: 60, speed: 6 };
    expect(deriveMetabolismRate({ ...base, visionRadius: 120 })).toBeGreaterThan(
      deriveMetabolismRate(base),
    );
    expect(deriveMetabolismRate({ ...base, speed: 12 })).toBeGreaterThan(deriveMetabolismRate(base));
  });

  it("never charges below the base upkeep floor", () => {
    expect(deriveMetabolismRate({ visionRadius: 0, speed: 0 })).toBeCloseTo(METABOLISM_BASE, 10);
  });

  it("makes speed superlinear, so it outpaces vision as both grow", () => {
    // Doubling speed should add more than double the speed-attributable cost,
    // which is what keeps the two genes on genuinely different tradeoff
    // curves rather than being interchangeable.
    const cheap = deriveMetabolismRate({ visionRadius: 0, speed: 5 }) - METABOLISM_BASE;
    const dear = deriveMetabolismRate({ visionRadius: 0, speed: 10 }) - METABOLISM_BASE;
    expect(dear).toBeGreaterThan(cheap * 2);
  });
});

describe("mutation", () => {
  it("produces variation around the parent rather than copying it", () => {
    const rng = createRng(42);
    const parent = { visionRadius: 64, speed: 6 };
    const children = Array.from({ length: 400 }, () => mutateTraits(parent, rng));

    const distinct = new Set(children.map((c) => c.visionRadius)).size;
    expect(distinct).toBeGreaterThan(300); // essentially all different

    const mean = children.reduce((s, c) => s + c.visionRadius, 0) / children.length;
    expect(mean).toBeGreaterThan(parent.visionRadius * 0.9);
    expect(mean).toBeLessThan(parent.visionRadius * 1.1);
  });

  it("keeps both genes inside their legal bounds even under extreme pressure", () => {
    const rng = createRng(7);
    // Start hard against each bound and mutate repeatedly — the clamp has to
    // hold, or downstream systems get a negative scan radius / teleporting
    // citizen.
    let low = { visionRadius: VISION_RADIUS_MIN, speed: MOVE_SPEED_MIN };
    let high = { visionRadius: VISION_RADIUS_MAX, speed: MOVE_SPEED_MAX };
    for (let i = 0; i < 500; i++) {
      low = mutateTraits(low, rng);
      high = mutateTraits(high, rng);
      for (const g of [low, high]) {
        expect(g.visionRadius).toBeGreaterThanOrEqual(VISION_RADIUS_MIN);
        expect(g.visionRadius).toBeLessThanOrEqual(VISION_RADIUS_MAX);
        expect(g.speed).toBeGreaterThanOrEqual(MOVE_SPEED_MIN);
        expect(g.speed).toBeLessThanOrEqual(MOVE_SPEED_MAX);
      }
    }
  });

  it("always derives upkeep consistently with the mutated genome", () => {
    const rng = createRng(99);
    let genome = { visionRadius: 64, speed: 6 };
    for (let i = 0; i < 200; i++) {
      const child = mutateTraits(genome, rng);
      expect(child.metabolismRate).toBeCloseTo(deriveMetabolismRate(child), 10);
      genome = child;
    }
  });

  it("stays deterministic for a given seed", () => {
    const run = () => {
      const rng = createRng(2024);
      const parent = { visionRadius: 64, speed: 6 };
      return Array.from({ length: 50 }, () => mutateTraits(parent, rng));
    };
    expect(run()).toEqual(run());
  });
});

describe("senescence", () => {
  it("is inert below the onset age", () => {
    expect(senescenceMultiplier(0)).toBe(1);
    expect(senescenceMultiplier(SENESCENCE_ONSET_TICKS)).toBe(1);
  });

  it("rises past onset and is capped", () => {
    expect(senescenceMultiplier(SENESCENCE_ONSET_TICKS + 1000)).toBeGreaterThan(1);
    expect(senescenceMultiplier(SENESCENCE_ONSET_TICKS + 100_000_000)).toBe(SENESCENCE_MAX_MULTIPLIER);
  });

  it("is monotonically non-decreasing in age", () => {
    let previous = 0;
    for (let age = 0; age < SENESCENCE_ONSET_TICKS * 4; age += 250) {
      const m = senescenceMultiplier(age);
      expect(m).toBeGreaterThanOrEqual(previous);
      previous = m;
    }
  });
});

describe("population-level evolution", () => {
  it("starts with non-zero trait variance and sustains it", () => {
    const world = createWorld({ seed: 11 });

    // Founders are drawn by mutating a shared genome, so variance exists
    // from tick 0 rather than having to be rebuilt by drift.
    const initial = computePopulationStats(world.citizens, world.tick);
    expect(initial.visionRadius.stdDev).toBeGreaterThan(0);
    expect(initial.speed.stdDev).toBeGreaterThan(0);

    for (let i = 0; i < 600; i++) tick(world);

    const later = computePopulationStats(world.citizens, world.tick);
    expect(later.population).toBeGreaterThan(0);
    // The failure mode being guarded against is variance collapsing to a
    // monoculture, at which point evolution has effectively stopped no
    // matter where the mean landed.
    expect(later.visionRadius.stdDev).toBeGreaterThan(0);
    expect(later.speed.stdDev).toBeGreaterThan(0);
  }, 30_000);

  it("advances generations and records parentage", () => {
    const world = createWorld({ seed: 12 });
    for (let i = 0; i < 600; i++) tick(world);

    const stats = computePopulationStats(world.citizens, world.tick);
    expect(stats.generation.max).toBeGreaterThan(0); // descendants exist

    const { citizens } = world;
    let founders = 0;
    let descendants = 0;
    for (let slot = 0; slot < citizens.count; slot++) {
      if (citizens.parentId[slot] === -1) {
        expect(citizens.generation[slot]).toBe(0);
        founders++;
      } else {
        expect(citizens.generation[slot]).toBeGreaterThan(0);
        descendants++;
      }
    }
    expect(descendants).toBeGreaterThan(0);
    expect(founders + descendants).toBe(citizens.count);
  }, 30_000);

  it("keeps every living citizen's cached upkeep consistent with its genome", () => {
    // Guards the cache-invalidation hazard in storing a derived value as a
    // column: if any code path ever writes a gene without recomputing
    // metabolismRate, selection silently starts using stale prices.
    const world = createWorld({ seed: 13 });
    for (let i = 0; i < 500; i++) tick(world);

    const { citizens } = world;
    for (let slot = 0; slot < citizens.count; slot++) {
      const expected = deriveMetabolismRate({
        visionRadius: citizens.visionRadius[slot],
        speed: citizens.speed[slot],
      });
      expect(citizens.metabolismRate[slot]).toBeCloseTo(expected, 4);
    }
  }, 30_000);

  it("stays deterministic end-to-end for a given seed", () => {
    const run = () => {
      const world = createWorld({ seed: 777 });
      for (let i = 0; i < 400; i++) tick(world);
      const s = computePopulationStats(world.citizens, world.tick);
      return [s.population, s.visionRadius.mean, s.speed.mean, s.generation.max];
    };
    expect(run()).toEqual(run());
  }, 30_000);
});
