// Material gather/haul resolution (Phase 2, rule 3/4). Runs every tick,
// independent of decideTargets' staggered cadence, because arrival/gathering
// takes a fixed handful of ticks and shouldn't stall waiting on the next
// scheduled decide. decideTargets (visionMovementHarvest.ts) owns setting
// SEEK_MATERIAL/HAULING_HOME targets; this file owns the state transitions
// that happen on arrival: SEEK_MATERIAL -> GATHERING -> HAULING_HOME, and
// (via a HomeEvent, resolved later in tick.ts) HAULING_HOME -> FORAGE.

import { MATERIAL_CARRY_CAPACITY, MATERIAL_GATHER_TICKS, MATERIAL_INTERACT_RADIUS } from "../constants.ts";
import { ACTIVITY_FORAGE, ACTIVITY_GATHERING, ACTIVITY_HAULING_HOME, ACTIVITY_SEEK_MATERIAL } from "../ecs/components.ts";
import type { CitizenStore } from "../ecs/store.ts";
import { depleteMaterial, type MaterialStore } from "../ecs/materialStore.ts";
import type { HomeEvent } from "../homes.ts";
import type { EntityId } from "../../types.ts";

/** Linear scan for the material node nearest a citizen's current target
 * coordinates, within MATERIAL_INTERACT_RADIUS. Re-resolving by proximity
 * (rather than storing a material EntityId on the citizen) keeps the
 * citizen schema free of a materials-specific id field and tolerates a
 * node having been depleted/removed by someone else since the citizen set
 * its target. */
function findMaterialAt(materials: MaterialStore, x: number, y: number): number | undefined {
  const radiusSq = MATERIAL_INTERACT_RADIUS * MATERIAL_INTERACT_RADIUS;
  for (let i = 0; i < materials.count; i++) {
    const dx = materials.fields.x[i] - x;
    const dy = materials.fields.y[i] - y;
    if (dx * dx + dy * dy <= radiusSq) return i;
  }
  return undefined;
}

/**
 * Resolves, every tick:
 *  - SEEK_MATERIAL -> GATHERING on arrival at the targeted node.
 *  - GATHERING countdown; on completion, transfers material into Carrying,
 *    deferring node depletion (pendingMaterialDepletions, keyed by stable
 *    EntityId — NOT slot index, since killing one depleted node via
 *    swap-remove could move another already-queued node into a different
 *    slot before tick.ts applies the batch, exactly the same hazard
 *    documented for citizen deaths) if it hits zero, and switches to
 *    HAULING_HOME. The haul target (home if hasHome, else the citizen's own
 *    current position) is set immediately on this same transition — not
 *    left for the next scheduled decide — so a citizen doesn't stand idle
 *    holding cargo for up to DECIDE_INTERVAL_TICKS.
 *  - HAULING_HOME arrival at the citizen's target (home, or its own
 *    position if homeless) emits a HomeEvent rather than mutating
 *    HomeRegistry directly, so same-tick deposits at one home resolve as a
 *    single batch (see tick.ts / homes.ts).
 */
export function checkMaterialArrivalAndGather(
  citizens: CitizenStore,
  materials: MaterialStore,
  pendingMaterialDepletions: EntityId[],
  pendingHomeEvents: HomeEvent[],
): void {
  for (let slot = 0; slot < citizens.count; slot++) {
    const activity = citizens.activity[slot];

    if (activity === ACTIVITY_SEEK_MATERIAL) {
      const materialSlot = findMaterialAt(materials, citizens.x[slot], citizens.y[slot]);
      if (materialSlot !== undefined) {
        citizens.activity[slot] = ACTIVITY_GATHERING;
        citizens.gatherCountdown[slot] = MATERIAL_GATHER_TICKS;
        citizens.hasTarget[slot] = 0; // stationary while gathering
      }
      continue;
    }

    if (activity === ACTIVITY_GATHERING) {
      citizens.gatherCountdown[slot]--;
      if (citizens.gatherCountdown[slot] > 0) continue;

      const materialSlot = findMaterialAt(materials, citizens.x[slot], citizens.y[slot]);
      if (materialSlot !== undefined) {
        const amount = Math.min(MATERIAL_CARRY_CAPACITY, materials.fields.quantity[materialSlot]);
        const removed = depleteMaterial(materials, materialSlot, amount);
        citizens.carryingQty[slot] = removed;
        citizens.carryingKind[slot] = materials.fields.kind[materialSlot];
        if (materials.fields.quantity[materialSlot] <= 0) {
          pendingMaterialDepletions.push(materials.id[materialSlot]);
        }
      }
      // Even if the node vanished (raced by another citizen since target
      // was set), still transition onward rather than getting stuck.
      citizens.activity[slot] = ACTIVITY_HAULING_HOME;

      // Set the haul target immediately rather than waiting for the next
      // scheduled decide — otherwise a citizen would stand idle holding
      // cargo for up to DECIDE_INTERVAL_TICKS after finishing gathering.
      if (citizens.hasHome[slot]) {
        citizens.targetX[slot] = citizens.homeX[slot];
        citizens.targetY[slot] = citizens.homeY[slot];
      } else {
        // No home yet — target is the citizen's own current position, i.e.
        // it drops material in place, seeding a new home there (homes.ts).
        citizens.targetX[slot] = citizens.x[slot];
        citizens.targetY[slot] = citizens.y[slot];
      }
      citizens.hasTarget[slot] = 1;
      continue;
    }

    if (activity === ACTIVITY_HAULING_HOME) {
      if (citizens.hasTarget[slot]) continue; // still traveling
      if (citizens.carryingQty[slot] <= 0) {
        // Nothing to deposit (e.g. a raced empty node) — just go back to foraging.
        citizens.activity[slot] = ACTIVITY_FORAGE;
        continue;
      }

      pendingHomeEvents.push({
        kind: "deposit",
        citizenId: citizens.id[slot],
        x: citizens.x[slot],
        y: citizens.y[slot],
        amount: citizens.carryingQty[slot],
      });
      citizens.carryingQty[slot] = 0;
      citizens.carryingKind[slot] = -1;
      citizens.activity[slot] = ACTIVITY_FORAGE;
    }
  }
}
