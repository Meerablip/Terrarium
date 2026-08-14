import type { EntityId } from "../types.ts";
import {
  CELL_SIZE,
  DECIDE_INTERVAL_TICKS,
  GRID_COLS,
  GRID_ROWS,
  INITIAL_POPULATION,
  MOVE_SPEED,
  REPRODUCTION_THRESHOLD,
  VISION_RADIUS,
  WORLD_SEED,
} from "./constants.ts";
import { mutateTraits } from "./traits.ts";
import { type CitizenStore, createCitizenStore, spawnCitizen } from "./ecs/store.ts";
import { type MaterialStore } from "./ecs/materialStore.ts";
import { createHomeRegistry, type HomeRegistry } from "./homes.ts";
import { createSettlementRegistry, type SettlementRegistry } from "./systems/settlements.ts";
import { createRng, randInt, randRange, type Rng } from "./rng.ts";
import { createTerrain, generatePonds, isWaterAt, type TerrainGrid } from "./terrain.ts";
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
  /** Terrain grid width in cells. Defaults to GRID_COLS. */
  cols?: number;
  /** Terrain grid height in cells. Defaults to GRID_ROWS. */
  rows?: number;
  /** World units per cell edge. Defaults to CELL_SIZE. */
  cellSize?: number;
}

/** Uniform-random position, resampled (bounded) away from water. A pond
 * covers a small fraction of the map, so a handful of attempts is enough in
 * practice; the bound just guards against a pathological config rather than
 * ever actually binding. */
function randomLandPosition(rng: Rng, terrain: TerrainGrid, worldWidth: number, worldHeight: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    x = randRange(rng, 0, worldWidth);
    y = randRange(rng, 0, worldHeight);
    if (!isWaterAt(terrain, x, y)) break;
  }
  return { x, y };
}

export function createWorld(config: WorldConfig = {}): World {
  const seed = config.seed ?? WORLD_SEED;
  const initialPopulation = config.initialPopulation ?? INITIAL_POPULATION;
  const cols = config.cols ?? GRID_COLS;
  const rows = config.rows ?? GRID_ROWS;
  const cellSize = config.cellSize ?? CELL_SIZE;
  const rng = createRng(seed);

  const terrain = createTerrain(cols, rows, cellSize, rng);
  generatePonds(terrain, rng);
  const citizens = createCitizenStore(Math.max(initialPopulation * 2, 64));

  const worldWidth = terrain.cols * terrain.cellSize;
  const worldHeight = terrain.rows * terrain.cellSize;
  const startingResource = REPRODUCTION_THRESHOLD / 2;
  // The founding genome. Founders don't all get it verbatim — each is drawn
  // by mutating it once, so generation 0 already carries standing variation.
  // Starting from a genuinely uniform population would work eventually
  // (mutation would rebuild variance over many generations) but it wastes
  // early ticks with nothing for selection to act on, and it makes the first
  // measurements of trait variance uninformative.
  const foundingGenome = { visionRadius: VISION_RADIUS, speed: MOVE_SPEED };

  for (let i = 0; i < initialPopulation; i++) {
    const { x, y } = randomLandPosition(rng, terrain, worldWidth, worldHeight);
    const heading = randRange(rng, -Math.PI, Math.PI);
    const traits = mutateTraits(foundingGenome, rng);
    const id = spawnCitizen(citizens, x, y, heading, startingResource, traits, {
      generation: 0,
      birthTick: 0,
      parentId: -1,
    });
    const slot = citizens.idToSlot.get(id)!;
    // Stagger decide cadence so the whole population doesn't re-scan vision
    // on the same tick — see decideTargets in visionMovementHarvest.ts.
    citizens.decideCountdown[slot] = randInt(rng, 1, DECIDE_INTERVAL_TICKS);
  }

  const materials = generateMaterials(terrain, rng);
  const homes = createHomeRegistry();
  const weather = createWeatherState(rng);
  const settlements = createSettlementRegistry();
  // Sized from the ACTUAL terrain dims, not the GRID_COLS/GRID_ROWS
  // constants — world size is configurable now, and a scratch buffer sized
  // for the default grid would be wrong (silently too small, or wasteful)
  // for any other size.
  const settlementCellPopScratch = new Uint16Array(terrain.cols * terrain.rows);

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
