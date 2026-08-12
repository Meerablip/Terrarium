// Rule 3 (Phase 2 split): each citizen infrequently re-evaluates a target
// cell within vision range ("decide"), steps toward its currently cached
// target every tick ("move", heading update folded in), and harvests from
// whichever cell it currently occupies every tick regardless of decide
// cadence. This replaces the MVP's single combined function, which
// re-decided a target every tick — the actual cause of "buzzing," since a
// citizen's chosen cell could flip tick-to-tick as harvested/regrown values
// shifted by tiny amounts even though position moved smoothly.
//
// Also folds in Phase 2 rule 3's material-seeking priority: decideTargets
// checks "am I hauling/should I seek material" before falling back to food
// foraging, so target-setting stays in one function rather than fragmenting
// across systems. checkMaterialArrivalAndGather (in materials.ts) owns the
// arrival/gather/deposit-trigger transitions, since those must resolve every
// tick independent of decide cadence.

import {
  DECIDE_INTERVAL_TICKS,
  FORAGE_SURPLUS_THRESHOLD,
  MAX_INTAKE,
  MEMORY_CAPACITY,
  MEMORY_MIN_PAYOFF,
  MEMORY_MIN_RESOURCE_TO_TRUST,
} from "../constants.ts";
import { ACTIVITY_FORAGE, ACTIVITY_GATHERING, ACTIVITY_HAULING_HOME, ACTIVITY_SEEK_MATERIAL } from "../ecs/components.ts";
import type { CitizenStore } from "../ecs/store.ts";
import type { MaterialStore } from "../ecs/materialStore.ts";
import type { Rng } from "../rng.ts";
import { cellIndex, cellToWorldCenter, worldToCell, type TerrainGrid } from "../terrain.ts";

/** Scans cells within visionRadius of (x,y) and returns the best (highest
 * resource, deterministically tie-broken) cell's world-center coordinates.
 * Extracted from the MVP's original combined function — algorithm unchanged,
 * generalized to take the citizen's own Traits.visionRadius rather than the
 * shared VISION_RADIUS constant, so Traits genuinely govern behavior (every
 * citizen's visionRadius is initialized from VISION_RADIUS today, but this
 * keeps that indirection real rather than bypassed). */
function scanForBestFoodCell(terrain: TerrainGrid, x: number, y: number, visionRadius: number): { x: number; y: number } {
  const cellRadius = Math.ceil(visionRadius / terrain.cellSize);
  const { cx: currentCx, cy: currentCy } = worldToCell(terrain, x, y);
  const currentIdx = cellIndex(terrain, currentCx, currentCy);

  let bestIdx = currentIdx;
  let bestCx = currentCx;
  let bestCy = currentCy;
  let bestResource = terrain.resource[currentIdx];
  let bestDistSq = 0;

  const minCx = Math.max(0, currentCx - cellRadius);
  const maxCx = Math.min(terrain.cols - 1, currentCx + cellRadius);
  const minCy = Math.max(0, currentCy - cellRadius);
  const maxCy = Math.min(terrain.rows - 1, currentCy + cellRadius);

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const dCx = cx - currentCx;
      const dCy = cy - currentCy;
      const distSq = dCx * dCx + dCy * dCy;
      if (distSq > cellRadius * cellRadius) continue; // circular vision field, not square

      const idx = cellIndex(terrain, cx, cy);
      const res = terrain.resource[idx];

      if (
        res > bestResource ||
        (res === bestResource && (distSq < bestDistSq || (distSq === bestDistSq && idx < bestIdx)))
      ) {
        bestResource = res;
        bestIdx = idx;
        bestCx = cx;
        bestCy = cy;
        bestDistSq = distSq;
      }
    }
  }

  return cellToWorldCenter(terrain, bestCx, bestCy);
}

/** Finds the nearest Material node to (x,y) within visionRadius, or
 * undefined if none is in range. Linear scan — material count is small
 * (MATERIAL_COUNT, low hundreds at most) so this is cheap relative to the
 * citizen population loop that calls it. */
function findNearestMaterialInRange(materials: MaterialStore, x: number, y: number, visionRadius: number): number | undefined {
  let bestSlot: number | undefined;
  let bestDistSq = visionRadius * visionRadius;
  for (let i = 0; i < materials.count; i++) {
    if (materials.fields.quantity[i] <= 0) continue;
    const dx = materials.fields.x[i] - x;
    const dy = materials.fields.y[i] - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestSlot = i;
      bestDistSq = distSq;
    }
  }
  return bestSlot;
}

/** Best remembered food location whose *current* terrain resource still
 * clears MEMORY_MIN_RESOURCE_TO_TRUST, or undefined if none qualifies.
 * Memory stores only coordinates, never stale resource values — a
 * remembered spot may have been depleted since, so this always re-reads
 * live terrain state. */
function bestTrustedMemory(citizens: CitizenStore, slot: number, terrain: TerrainGrid): { x: number; y: number } | undefined {
  const count = citizens.memCount[slot];
  let bestVal = -Infinity;
  let bestX = 0;
  let bestY = 0;
  let found = false;

  for (let i = 0; i < count; i++) {
    const mx = citizens.memX[slot * MEMORY_CAPACITY + i];
    const my = citizens.memY[slot * MEMORY_CAPACITY + i];
    const { cx, cy } = worldToCell(terrain, mx, my);
    const res = terrain.resource[cellIndex(terrain, cx, cy)];
    if (res >= MEMORY_MIN_RESOURCE_TO_TRUST && res > bestVal) {
      bestVal = res;
      bestX = mx;
      bestY = my;
      found = true;
    }
  }

  return found ? { x: bestX, y: bestY } : undefined;
}

function setTarget(citizens: CitizenStore, slot: number, x: number, y: number): void {
  citizens.targetX[slot] = x;
  citizens.targetY[slot] = y;
  citizens.hasTarget[slot] = 1;
}

/**
 * Infrequent per-citizen re-evaluation of a movement target. Only runs for
 * citizens whose decideCountdown has reached 0 this tick (staggered at
 * spawn so the whole population doesn't re-scan on the same tick — see
 * spawnCitizen/tick.ts). Priority: hauling home > gathering (no-op, target
 * managed elsewhere) > seek material (if surplus resource and one is known)
 * > forage (memory first, then a fresh vision scan).
 *
 * Reads a citizen's home destination from its own cached homeX/homeY fields
 * rather than looking it up in HomeRegistry — this hot per-citizen loop
 * stays array-indexed only, with no Map lookups, matching every other
 * hot loop in this codebase.
 */
export function decideTargets(
  citizens: CitizenStore,
  terrain: TerrainGrid,
  materials: MaterialStore,
  rng: Rng,
): void {
  for (let slot = 0; slot < citizens.count; slot++) {
    if (citizens.decideCountdown[slot] > 0) {
      citizens.decideCountdown[slot]--;
      continue;
    }
    citizens.decideCountdown[slot] = DECIDE_INTERVAL_TICKS;

    const activity = citizens.activity[slot];

    if (activity === ACTIVITY_GATHERING) {
      // Stationary while gathering; checkMaterialArrivalAndGather owns this
      // transition every tick, not decide.
      continue;
    }

    if (citizens.carryingQty[slot] > 0 || activity === ACTIVITY_HAULING_HOME) {
      citizens.activity[slot] = ACTIVITY_HAULING_HOME;
      if (citizens.hasHome[slot]) {
        setTarget(citizens, slot, citizens.homeX[slot], citizens.homeY[slot]);
      } else {
        // No home yet — drop material in place, seeding a new home there
        // (see homes.ts / materials.ts's applyDeposit trigger).
        setTarget(citizens, slot, citizens.x[slot], citizens.y[slot]);
      }
      continue;
    }

    const visionRadius = citizens.visionRadius[slot];

    if (citizens.resource[slot] > FORAGE_SURPLUS_THRESHOLD) {
      const materialSlot = findNearestMaterialInRange(materials, citizens.x[slot], citizens.y[slot], visionRadius);
      if (materialSlot !== undefined) {
        citizens.activity[slot] = ACTIVITY_SEEK_MATERIAL;
        setTarget(citizens, slot, materials.fields.x[materialSlot], materials.fields.y[materialSlot]);
        continue;
      }
    }

    citizens.activity[slot] = ACTIVITY_FORAGE;
    const remembered = bestTrustedMemory(citizens, slot, terrain);
    const target = remembered ?? scanForBestFoodCell(terrain, citizens.x[slot], citizens.y[slot], visionRadius);
    setTarget(citizens, slot, target.x, target.y);
  }

  // rng is accepted for API symmetry with other Phase 2 systems (e.g. future
  // tie-break randomization) but unused today — decide is fully deterministic.
  void rng;
}

/** Every tick, unconditional: steps each citizen with an active target up to
 * `speed[slot]` world units toward it, snapping on arrival, updating heading
 * only on actual displacement — a direct lift of the MVP's move arithmetic,
 * driven by the cached target instead of a freshly-scanned one. */
export function moveTowardTarget(citizens: CitizenStore): void {
  for (let slot = 0; slot < citizens.count; slot++) {
    if (!citizens.hasTarget[slot]) continue;

    const x = citizens.x[slot];
    const y = citizens.y[slot];
    const dx = citizens.targetX[slot] - x;
    const dy = citizens.targetY[slot] - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = citizens.speed[slot];

    if (dist <= speed || dist === 0) {
      citizens.x[slot] = citizens.targetX[slot];
      citizens.y[slot] = citizens.targetY[slot];
      citizens.hasTarget[slot] = 0;
    } else {
      const t = speed / dist;
      citizens.x[slot] = x + dx * t;
      citizens.y[slot] = y + dy * t;
    }

    if (dx !== 0 || dy !== 0) {
      citizens.heading[slot] = Math.atan2(dy, dx);
    }
  }
}

function writeMemory(citizens: CitizenStore, slot: number, x: number, y: number): void {
  const writeIdx = citizens.memWriteIdx[slot];
  citizens.memX[slot * MEMORY_CAPACITY + writeIdx] = x;
  citizens.memY[slot * MEMORY_CAPACITY + writeIdx] = y;
  citizens.memWriteIdx[slot] = (writeIdx + 1) % MEMORY_CAPACITY;
  if (citizens.memCount[slot] < MEMORY_CAPACITY) citizens.memCount[slot]++;
}

/** Harvest still resolves every tick regardless of decide cadence, against
 * whichever cell the citizen currently occupies — unchanged from the MVP's
 * rule. Also writes a Memory entry when the harvest clears
 * MEMORY_MIN_PAYOFF, so future decides can consider this spot without a
 * fresh vision scan. */
export function harvestAtCurrentCell(citizens: CitizenStore, terrain: TerrainGrid): void {
  for (let slot = 0; slot < citizens.count; slot++) {
    const { cx, cy } = worldToCell(terrain, citizens.x[slot], citizens.y[slot]);
    const idx = cellIndex(terrain, cx, cy);
    const intake = Math.min(MAX_INTAKE, terrain.resource[idx]);
    terrain.resource[idx] -= intake;
    citizens.resource[slot] += intake;

    if (intake >= MEMORY_MIN_PAYOFF) {
      const center = cellToWorldCenter(terrain, cx, cy);
      writeMemory(citizens, slot, center.x, center.y);
    }
  }
}
