// Home / building system (Phase 2, rule 4). Homes are lightweight,
// low-cardinality, Map-backed records — not the SoA factory — since they're
// read far more than written and need variable-size membership sets, the
// wrong shape for fixed-width columnar arrays whose whole purpose is
// branchless per-tick iteration over hundreds of live entities.
//
// A HomeRecord's lifetime is independent of any single citizen's lifetime:
// it is never deleted when its founder or all members die. An unfinished or
// emptied-out home is simply an abandoned-but-valid construction site —
// any future citizen hauling material to that spot resumes it from wherever
// buildProgress was left. This needs no special-case "abandoned site"
// handling, which is deliberate: that state is already valid.

import { HOME_ATTACH_RADIUS, HOME_COMPLETE_THRESHOLD } from "./constants.ts";
import type { CitizenStore } from "./ecs/store.ts";
import type { EntityId } from "../types.ts";

export interface HomeRecord {
  id: number;
  x: number;
  y: number;
  buildProgress: number;
  complete: boolean;
  memberIds: Set<EntityId>;
  founderId: EntityId;
}

export interface HomeRegistry {
  homes: Map<number, HomeRecord>;
  nextHomeId: number;
}

export function createHomeRegistry(): HomeRegistry {
  return { homes: new Map(), nextHomeId: 1 };
}

/** A citizen depositing carried material at (or near) a home. Emitted by the
 * material system (checkMaterialArrivalAndGather) during its per-citizen
 * pass, applied in a single batch after all citizens have been evaluated —
 * see tick.ts. Batching (rather than applying inline, citizen by citizen)
 * matters because multiple citizens can deposit at the same home in one
 * tick; resolving them together avoids order-dependent double-counting. */
export interface HomeEvent {
  kind: "deposit";
  citizenId: EntityId;
  x: number;
  y: number;
  amount: number;
}

function findHomeNear(homes: HomeRegistry, x: number, y: number, radius: number): HomeRecord | undefined {
  let best: HomeRecord | undefined;
  let bestDistSq = radius * radius;
  for (const home of homes.homes.values()) {
    const dx = home.x - x;
    const dy = home.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      best = home;
      bestDistSq = distSq;
    }
  }
  return best;
}

/**
 * Resolves all of this tick's deposit events against the registry, then
 * attaches/updates the depositing citizens' Home-link fields. Pure Map
 * mutation plus citizen-field writes on already-live slots — no structural
 * store mutation (spawn/kill), so this needs no swap-remove-safety deferral
 * itself; it's deferred only so multiple same-tick deposits at one home
 * resolve as a single consistent batch.
 */
export function applyHomeEvents(homes: HomeRegistry, citizens: CitizenStore, events: HomeEvent[]): void {
  for (const event of events) {
    let home = findHomeNear(homes, event.x, event.y, HOME_ATTACH_RADIUS);

    if (!home) {
      home = {
        id: homes.nextHomeId++,
        x: event.x,
        y: event.y,
        buildProgress: 0,
        complete: false,
        memberIds: new Set(),
        founderId: event.citizenId,
      };
      homes.homes.set(home.id, home);
    }

    home.buildProgress += event.amount;
    if (!home.complete && home.buildProgress >= HOME_COMPLETE_THRESHOLD) {
      home.complete = true;
    }
    home.memberIds.add(event.citizenId);

    const slot = citizens.idToSlot.get(event.citizenId);
    if (slot !== undefined) {
      citizens.hasHome[slot] = 1;
      citizens.homeId[slot] = home.id;
      citizens.homeX[slot] = home.x;
      citizens.homeY[slot] = home.y;
    }
  }
}
