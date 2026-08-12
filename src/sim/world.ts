import type { EntityId } from "../types.ts";
import {
  DECIDE_INTERVAL_TICKS,
  GRID_COLS,
  GRID_ROWS,
  INITIAL_POPULATION,
  METABOLISM_RATE,
  MOVE_SPEED,
  REPRODUCTION_THRESHOLD,
  VISION_RADIUS,
  WORLD_SEED,
} from "./constants.ts";
import { type CitizenStore, createCitizenStore, spawnCitizen } from "./ecs/store.ts";
import { type MaterialStore } from "./ecs/materialStore.ts";
import { createHomeRegistry, type HomeRegistry } from "./homes.ts";
import { createSettlementRegistry, type SettlementRegistry } from "./systems/settlements.ts";
import { createRng, randInt, randRange, type Rng } from "./rng.ts";
import { createDefaultTerrain, type TerrainGrid } from "./terrain.ts";
import { generateMaterials } from "./worldgen/materials.ts";
import { createWeatherState, type WeatherState } from "./weather.ts";

export interface World {
  terrain: TerrainGrid;
  citizens: CitizenStore;
  materials: MaterialStore;
  homes: HomeRegistry;
  weather: WeatherState;
  settlements: SettlementRegistry;
  /** Scratch buffer reused every tick by the settlement clustering pass —
   * allocated once here, not per-tick, matching the codebase's existing
   * persistent-scratch-array pattern (see terrain gen / homeBoostScratch). */
  settlementCellPopScratch: Uint16Array;
  /** Number of ticks elapsed since world creation. */
  tick: number;
  rng: Rng;
}

export interface WorldConfig {
  seed?: number;
  initialPopulation?: number;
}

export function createWorld(config: WorldConfig = {}): World {
  const seed = config.seed ?? WORLD_SEED;
  const initialPopulation = config.initialPopulation ?? INITIAL_POPULATION;
  const rng = createRng(seed);

  const terrain = createDefaultTerrain(rng);
  const citizens = createCitizenStore(Math.max(initialPopulation * 2, 64));

  const worldWidth = terrain.cols * terrain.cellSize;
  const worldHeight = terrain.rows * terrain.cellSize;
  const startingResource = REPRODUCTION_THRESHOLD / 2;
  const defaultTraits = { visionRadius: VISION_RADIUS, speed: MOVE_SPEED, metabolismRate: METABOLISM_RATE };

  for (let i = 0; i < initialPopulation; i++) {
    const x = randRange(rng, 0, worldWidth);
    const y = randRange(rng, 0, worldHeight);
    const heading = randRange(rng, -Math.PI, Math.PI);
    const id = spawnCitizen(citizens, x, y, heading, startingResource, defaultTraits);
    const slot = citizens.idToSlot.get(id)!;
    // Stagger decide cadence so the whole population doesn't re-scan vision
    // on the same tick — see decideTargets in visionMovementHarvest.ts.
    citizens.decideCountdown[slot] = randInt(rng, 1, DECIDE_INTERVAL_TICKS);
  }

  const materials = generateMaterials(worldWidth, worldHeight, rng);
  const homes = createHomeRegistry();
  const weather = createWeatherState(rng);
  const settlements = createSettlementRegistry();
  const settlementCellPopScratch = new Uint16Array(GRID_COLS * GRID_ROWS);

  return {
    terrain,
    citizens,
    materials,
    homes,
    weather,
    settlements,
    settlementCellPopScratch,
    tick: 0,
    rng,
  };
}

export type { EntityId };
