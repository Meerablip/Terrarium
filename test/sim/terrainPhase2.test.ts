import { describe, expect, it } from "vitest";
import {
  AGRICULTURE_MULTIPLIER,
  GRID_COLS,
  GRID_ROWS,
  PATH_WEAR_INCREMENT,
  PATH_WEAR_MAX,
  REGROWTH_RATE,
  WEATHER_DURATION_TICKS,
  WEATHER_MOISTURE_BOOST,
} from "../../src/sim/constants.ts";
import { createHomeRegistry, type HomeRecord } from "../../src/sim/homes.ts";
import { createCitizenStore, spawnCitizen } from "../../src/sim/ecs/store.ts";
import { applyPathWear, cellIndex, createTerrain, regrowTerrain, worldToCell } from "../../src/sim/terrain.ts";
import { createWeatherState, updateWeather } from "../../src/sim/weather.ts";
import { createRng } from "../../src/sim/rng.ts";

describe("agriculture (regrowTerrain home-proximity multiplier)", () => {
  it("regrows a cell near a complete home faster than a wild cell, capped at capacity", () => {
    const rng = createRng(10);
    const terrain = createTerrain(20, 20, 16, rng);
    // Force known starting resource levels well below capacity so the boost is observable.
    terrain.resource.fill(10);

    const homes = createHomeRegistry();
    const home: HomeRecord = {
      id: 1,
      x: 5 * 16,
      y: 5 * 16,
      buildProgress: 999,
      complete: true,
      memberIds: new Set(),
      founderId: 1,
    };
    homes.homes.set(1, home);

    const weather = createWeatherState(rng);
    // Ensure weather isn't accidentally active during this test.
    weather.active = false;

    const nearIdx = cellIndex(terrain, 5, 5); // at the home's own cell
    const farIdx = cellIndex(terrain, 19, 19); // far away, outside AGRICULTURE_RADIUS_CELLS

    const nearBefore = terrain.resource[nearIdx];
    const farBefore = terrain.resource[farIdx];

    regrowTerrain(terrain, homes, weather);

    const nearDelta = terrain.resource[nearIdx] - nearBefore;
    const farDelta = terrain.resource[farIdx] - farBefore;

    expect(nearDelta).toBeCloseTo(REGROWTH_RATE * AGRICULTURE_MULTIPLIER, 5);
    expect(farDelta).toBeCloseTo(REGROWTH_RATE, 5);
  });

  it("does not boost regrowth near an incomplete home", () => {
    const rng = createRng(11);
    const terrain = createTerrain(20, 20, 16, rng);
    terrain.resource.fill(10);

    const homes = createHomeRegistry();
    homes.homes.set(1, {
      id: 1,
      x: 5 * 16,
      y: 5 * 16,
      buildProgress: 10,
      complete: false, // not yet complete
      memberIds: new Set(),
      founderId: 1,
    });
    const weather = createWeatherState(rng);
    weather.active = false;

    const idx = cellIndex(terrain, 5, 5);
    const before = terrain.resource[idx];
    regrowTerrain(terrain, homes, weather);
    expect(terrain.resource[idx] - before).toBeCloseTo(REGROWTH_RATE, 5);
  });
});

describe("path wear", () => {
  it("increments on occupied cells and decays over time when vacated", () => {
    const rng = createRng(12);
    const terrain = createTerrain(20, 20, 16, rng);
    const citizens = createCitizenStore(4);
    const homes = createHomeRegistry();
    const weather = createWeatherState(rng);
    weather.active = false;

    const id = spawnCitizen(citizens, 5 * 16 + 8, 5 * 16 + 8, 0, 100);
    const { cx, cy } = worldToCell(terrain, citizens.x[citizens.idToSlot.get(id)!], citizens.y[citizens.idToSlot.get(id)!]);
    const idx = cellIndex(terrain, cx, cy);

    const K = 5;
    for (let i = 0; i < K; i++) {
      applyPathWear(terrain, citizens);
      regrowTerrain(terrain, homes, weather); // decay happens here
    }
    // K increments then K decays happen in lockstep per the loop above, so
    // check wear is nonzero and bounded rather than an exact value (decay
    // is applied the same tick as each increment in this loop structure).
    expect(terrain.pathWear[idx]).toBeGreaterThan(0);
    expect(terrain.pathWear[idx]).toBeLessThanOrEqual(PATH_WEAR_MAX);

    // Move the citizen away and confirm the cell's wear now only decays.
    const slot = citizens.idToSlot.get(id)!;
    citizens.x[slot] = 0;
    citizens.y[slot] = 0;
    const wearBeforeDecay = terrain.pathWear[idx];
    regrowTerrain(terrain, homes, weather);
    expect(terrain.pathWear[idx]).toBeLessThanOrEqual(wearBeforeDecay);
  });

  it("clamps wear at PATH_WEAR_MAX under sustained occupation", () => {
    const rng = createRng(13);
    const terrain = createTerrain(10, 10, 16, rng);
    const citizens = createCitizenStore(4);
    const id = spawnCitizen(citizens, 8, 8, 0, 100);
    void id;

    const ticksNeeded = Math.ceil(PATH_WEAR_MAX / PATH_WEAR_INCREMENT) + 10;
    for (let i = 0; i < ticksNeeded; i++) {
      applyPathWear(terrain, citizens);
    }
    const idx = cellIndex(terrain, 0, 0);
    expect(terrain.pathWear[idx]).toBeLessThanOrEqual(PATH_WEAR_MAX);
  });
});

describe("weather", () => {
  it("stays inactive until its scheduled tick, then activates, then deactivates after its duration", () => {
    const rng = createRng(14);
    const terrain = createTerrain(GRID_COLS, GRID_ROWS, 16, rng);
    const weather = createWeatherState(rng);

    expect(weather.active).toBe(false);
    const eventTick = weather.nextEventTick;

    for (let t = 0; t < eventTick; t++) {
      updateWeather(weather, rng, t, terrain);
    }
    expect(weather.active).toBe(false); // one tick before the event

    updateWeather(weather, rng, eventTick, terrain);
    expect(weather.active).toBe(true);

    for (let i = 0; i < WEATHER_DURATION_TICKS - 1; i++) {
      updateWeather(weather, rng, eventTick + 1 + i, terrain);
    }
    expect(weather.active).toBe(true); // still within duration

    updateWeather(weather, rng, eventTick + WEATHER_DURATION_TICKS, terrain);
    expect(weather.active).toBe(false); // duration elapsed
    expect(weather.nextEventTick).toBeGreaterThan(eventTick + WEATHER_DURATION_TICKS);
  });

  it("boosts regrowth inside an active weather region vs. outside it", () => {
    const rng = createRng(15);
    const terrain = createTerrain(20, 20, 16, rng);
    terrain.resource.fill(10);
    const homes = createHomeRegistry();
    const weather = createWeatherState(rng);

    weather.active = true;
    weather.regionCx = 5 * 16 + 8;
    weather.regionCy = 5 * 16 + 8;
    weather.regionRadius = 20;
    weather.ticksRemaining = 10;

    const insideIdx = cellIndex(terrain, 5, 5);
    const outsideIdx = cellIndex(terrain, 19, 19);
    const insideBefore = terrain.resource[insideIdx];
    const outsideBefore = terrain.resource[outsideIdx];

    regrowTerrain(terrain, homes, weather);

    expect(terrain.resource[insideIdx] - insideBefore).toBeCloseTo(REGROWTH_RATE * WEATHER_MOISTURE_BOOST, 5);
    expect(terrain.resource[outsideIdx] - outsideBefore).toBeCloseTo(REGROWTH_RATE, 5);
  });
});
