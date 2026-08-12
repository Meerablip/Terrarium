import { describe, expect, it } from "vitest";
import { DECIDE_INTERVAL_TICKS } from "../../src/sim/constants.ts";
import { createWorld } from "../../src/sim/world.ts";
import { tick } from "../../src/sim/tick.ts";

describe("decide/move split", () => {
  it("stops re-deciding every tick — heading is stable within an inter-decide interval", () => {
    const world = createWorld({ seed: 1, initialPopulation: 20 });

    // Run past the first decide so every citizen has an active cached target,
    // then sample heading across a short run well inside one decide interval
    // and confirm it doesn't oscillate.
    for (let i = 0; i < DECIDE_INTERVAL_TICKS; i++) tick(world);

    const slot = 0;
    const headingsSeen = new Set<number>();
    for (let i = 0; i < 3; i++) {
      tick(world);
      headingsSeen.add(Math.round(world.citizens.heading[slot] * 1000) / 1000);
    }
    // Heading may legitimately be constant (citizen arrived and is
    // stationary) or change smoothly, but should not wildly flip sign
    // every single tick the way "decide every tick" would cause. This is a
    // smoke check, not an exact oscillation detector: assert it took at
    // most 2 distinct headings across 3 ticks (arrival + one turn, at most).
    expect(headingsSeen.size).toBeLessThanOrEqual(2);
  });

  it("staggers decideCountdown across freshly-spawned citizens instead of a shared global cadence", () => {
    const world = createWorld({ seed: 2, initialPopulation: 30 });
    const countdowns = new Set<number>();
    for (let slot = 0; slot < world.citizens.count; slot++) {
      countdowns.add(world.citizens.decideCountdown[slot]);
    }
    // With 30 citizens and DECIDE_INTERVAL_TICKS staggering, we should see
    // meaningfully more than 1 distinct countdown value (a shared global
    // cadence would produce exactly 1).
    expect(countdowns.size).toBeGreaterThan(1);
  });

  it("moves citizens gradually over several ticks rather than snapping instantly", () => {
    const world = createWorld({ seed: 3, initialPopulation: 10 });
    const slot = 0;
    const startX = world.citizens.x[slot];
    const startY = world.citizens.y[slot];

    tick(world);
    const afterOneTickX = world.citizens.x[slot];
    const afterOneTickY = world.citizens.y[slot];
    const distMovedInOneTick = Math.hypot(afterOneTickX - startX, afterOneTickY - startY);

    // A single tick's movement should be bounded by the citizen's speed
    // trait (continuous stepping), not an arbitrary teleport across the map.
    expect(distMovedInOneTick).toBeLessThanOrEqual(world.citizens.speed[slot] + 1e-6);
  });
});
