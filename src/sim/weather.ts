// Weather (Phase 2, rule 7): a periodic, interval-based rule that raises
// moisture across a region for a duration, boosting regrowth there. Same
// class of rule as terrain fertility — additive, terrain-layer only, no new
// component or entity type. State lives on World alongside terrain/citizens.

import { WEATHER_DURATION_TICKS, WEATHER_INTERVAL_TICKS, WEATHER_JITTER_TICKS, WEATHER_REGION_RADIUS } from "./constants.ts";
import { randInt, randRange, type Rng } from "./rng.ts";
import type { TerrainGrid } from "./terrain.ts";

export interface WeatherState {
  active: boolean;
  regionCx: number;
  regionCy: number;
  regionRadius: number;
  ticksRemaining: number;
  nextEventTick: number;
}

function scheduleNextEvent(tick: number, rng: Rng): number {
  return tick + WEATHER_INTERVAL_TICKS + randInt(rng, -WEATHER_JITTER_TICKS, WEATHER_JITTER_TICKS);
}

export function createWeatherState(rng: Rng): WeatherState {
  return {
    active: false,
    regionCx: 0,
    regionCy: 0,
    regionRadius: WEATHER_REGION_RADIUS,
    ticksRemaining: 0,
    nextEventTick: scheduleNextEvent(0, rng),
  };
}

/** Advances weather by one tick: activates a new event when due, decrements
 * an active event's remaining duration, and deactivates + reschedules when
 * it expires. Called once per tick from tick.ts, before regrowTerrain (which
 * reads `weather.active`/region to apply the moisture boost). */
export function updateWeather(weather: WeatherState, rng: Rng, tick: number, grid: TerrainGrid): void {
  if (!weather.active) {
    if (tick >= weather.nextEventTick) {
      weather.active = true;
      weather.regionCx = randRange(rng, 0, grid.cols * grid.cellSize);
      weather.regionCy = randRange(rng, 0, grid.rows * grid.cellSize);
      weather.regionRadius = WEATHER_REGION_RADIUS;
      weather.ticksRemaining = WEATHER_DURATION_TICKS;
    }
    return;
  }

  weather.ticksRemaining--;
  if (weather.ticksRemaining <= 0) {
    weather.active = false;
    weather.nextEventTick = scheduleNextEvent(tick, rng);
  }
}

/** True if the given world-space point currently falls inside an active
 * weather event's region. Plain inline distance check (no persistent mask)
 * since weather is transient/small-region — cheaper to recompute per cell
 * only while active than to maintain and clear a full-grid array every tick. */
export function isInWeatherRegion(weather: WeatherState, x: number, y: number): boolean {
  if (!weather.active) return false;
  const dx = x - weather.regionCx;
  const dy = y - weather.regionCy;
  return dx * dx + dy * dy <= weather.regionRadius * weather.regionRadius;
}
