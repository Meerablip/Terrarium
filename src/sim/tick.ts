// Advances the world by exactly one simulation step. This is the only
// function that should be called to progress the sim, and it is the only
// place system order and death/spawn/depletion/home-event application are
// decided.
//
// Order: weather+regrowth+wear -> metabolism -> decide -> move -> material
// arrival/gather/deposit -> harvest -> reproduction -> deferred apply ->
// settlement registry.
//  - Weather/regrowth/wear first: terrain reflects a full tick's growth
//    (and this tick's weather/agriculture state) before anyone harvests it.
//  - Metabolism before acting: a citizen pays its upkeep cost before it
//    acts, so a starving citizen can't dodge death by always harvesting
//    before its resource is checked.
//  - Decide before move: a citizen needs a target cached before movement can
//    step toward it (decide only actually re-scans on a citizen's staggered
//    cadence; move runs unconditionally every tick regardless).
//  - Material arrival/gather/deposit resolution after move, before harvest:
//    arrival/gather transitions depend on this tick's movement, but harvest
//    is independent of them and should resolve regardless.
//  - Harvest before reproduction: a citizen needs this tick's harvest
//    counted before the reproduction threshold check, so a citizen that
//    crosses the threshold via this tick's harvest reproduces this same
//    tick rather than one tick late.
//  - Settlement registry last: a pure post-tick read pass over now-stable
//    citizen/home state (this tick's deaths/spawns/depletions/home-events
//    have already been applied), so it needs no deferral of its own.
//
// Deferred structural mutations (deaths, spawns, material depletions, home
// events) are collected into pending arrays during the systems above and
// applied only in one batch step, for the same reason as the MVP's original
// death/spawn deferral: killAtSlot's swap-remove moves a different entity
// into the slot being removed, so mutating store structure mid-iteration
// would silently skip whichever entity got swapped into the current index
// for the rest of that system's pass. Home events are additionally deferred
// so multiple citizens depositing at the same home in one tick resolve as a
// single consistent batch rather than order-dependent double-counting.

import type { EntityId } from "../types.ts";
import { DECIDE_INTERVAL_TICKS } from "./constants.ts";
import { killAtSlot, spawnCitizen } from "./ecs/store.ts";
import { killAtSlot as killMaterialAtSlot } from "./ecs/materialStore.ts";
import { applyHomeEvents, type HomeEvent } from "./homes.ts";
import {
  applyMetabolism,
  applyReproduction,
  checkMaterialArrivalAndGather,
  decideTargets,
  harvestAtCurrentCell,
  moveTowardTarget,
  type SpawnRequest,
} from "./systems/index.ts";
import { updateSettlementRegistry } from "./systems/settlements.ts";
import { randInt } from "./rng.ts";
import { applyPathWear, regrowTerrain } from "./terrain.ts";
import { updateWeather } from "./weather.ts";
import type { World } from "./world.ts";

export function tick(world: World): void {
  const { terrain, citizens, materials, homes, weather, settlements, settlementCellPopScratch, rng } = world;

  // 1. Weather + terrain regrowth (agriculture + weather multipliers folded
  //    in) + path wear (increment-on-occupy; decay is folded inside
  //    regrowTerrain's per-cell loop).
  updateWeather(weather, rng, world.tick, terrain);
  regrowTerrain(terrain, homes, weather);
  applyPathWear(terrain, citizens);

  // 2. Metabolism
  const pendingDeaths: EntityId[] = [];
  applyMetabolism(citizens, pendingDeaths);

  // 3. Decide (staggered per-citizen; folds in food/material/haul target selection)
  decideTargets(citizens, terrain, materials, rng);

  // 4. Move + heading (unconditional every tick, toward cached target)
  moveTowardTarget(citizens);

  // 5. Material arrival/gather/deposit-trigger resolution
  const pendingMaterialDepletions: EntityId[] = [];
  const pendingHomeEvents: HomeEvent[] = [];
  checkMaterialArrivalAndGather(citizens, materials, pendingMaterialDepletions, pendingHomeEvents);

  // 6. Harvest (resolves post-move every tick, independent of decide cadence)
  harvestAtCurrentCell(citizens, terrain);

  // 7. Reproduction (mutates the child's genome — needs the seeded rng)
  const pendingSpawns: SpawnRequest[] = [];
  applyReproduction(citizens, pendingSpawns, rng);

  // 8. Apply deferred structural changes: deaths, then spawns, then material
  //    depletions, then home events.
  for (const id of pendingDeaths) {
    const slot = citizens.idToSlot.get(id);
    if (slot !== undefined) {
      if (citizens.hasHome[slot]) {
        homes.homes.get(citizens.homeId[slot])?.memberIds.delete(id);
      }
      killAtSlot(citizens, slot);
    }
  }
  for (const req of pendingSpawns) {
    const id = spawnCitizen(
      citizens,
      req.x,
      req.y,
      req.heading,
      req.resource,
      {
        visionRadius: req.visionRadius,
        speed: req.speed,
        metabolismRate: req.metabolismRate,
      },
      { generation: req.generation, birthTick: world.tick, parentId: req.parentId },
    );
    const slot = citizens.idToSlot.get(id)!;
    citizens.decideCountdown[slot] = randInt(rng, 1, DECIDE_INTERVAL_TICKS);
  }
  for (const id of pendingMaterialDepletions) {
    const slot = materials.idToSlot.get(id);
    if (slot !== undefined) killMaterialAtSlot(materials, slot);
  }
  applyHomeEvents(homes, citizens, pendingHomeEvents);

  // 9. Settlement registry: pure post-tick read pass over now-stable
  //    citizen/home state, no pending array needed.
  updateSettlementRegistry(settlements, citizens, homes, terrain, world.tick, rng, settlementCellPopScratch);

  world.tick += 1;
}
