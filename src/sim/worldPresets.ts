// World presets and env-based world configuration, shared by both entry
// points (the server in src/server/index.ts and the headless tuning runner
// in headlessRunner.ts) so they can't drift into configuring worlds
// differently — which would make a headless tuning run's numbers not
// actually describe the world the server runs.

import {
  SANDBOX_GRID_COLS,
  SANDBOX_GRID_ROWS,
  SANDBOX_INITIAL_POPULATION,
} from "./constants.ts";
import type { WorldConfig } from "./world.ts";

/** Small, legible world for watching individual agents — see the
 * SANDBOX_* constants for why small is a deliberate choice and not just a
 * performance shortcut. */
export const SANDBOX_PRESET: WorldConfig = {
  cols: SANDBOX_GRID_COLS,
  rows: SANDBOX_GRID_ROWS,
  initialPopulation: SANDBOX_INITIAL_POPULATION,
};

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return Math.floor(value);
}

/**
 * Resolves a WorldConfig from the environment.
 *
 *   TERRARIUM_SANDBOX=1   use the small sandbox world
 *   WORLD_COLS / WORLD_ROWS / INITIAL_POP / WORLD_SEED   individual overrides
 *
 * Individual overrides win over the preset, so `TERRARIUM_SANDBOX=1
 * INITIAL_POP=10` is a sandbox world with a smaller founding population.
 * Returns `{}` (i.e. all defaults) when nothing is set.
 */
export function worldConfigFromEnv(): WorldConfig {
  const base: WorldConfig = process.env.TERRARIUM_SANDBOX === "1" ? { ...SANDBOX_PRESET } : {};

  const cols = envInt("WORLD_COLS");
  const rows = envInt("WORLD_ROWS");
  const initialPopulation = envInt("INITIAL_POP");
  const seed = envInt("WORLD_SEED");

  if (cols !== undefined) base.cols = cols;
  if (rows !== undefined) base.rows = rows;
  if (initialPopulation !== undefined) base.initialPopulation = initialPopulation;
  if (seed !== undefined) base.seed = seed;

  return base;
}

/** Human-readable one-liner for startup logs, so a run's world config is
 * always visible in the output rather than having to be inferred. */
export function describeWorldConfig(config: WorldConfig): string {
  const cols = config.cols ?? "default";
  const rows = config.rows ?? "default";
  const pop = config.initialPopulation ?? "default";
  const seed = config.seed ?? "default";
  return `world ${cols}x${rows} cells, initialPopulation=${pop}, seed=${seed}`;
}
