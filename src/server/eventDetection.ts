// Birth/death/settlement event inference via before/after summary diffing.
// tick.ts stays 100% persistence-agnostic — no import of anything under
// src/server/, no signature change, no new return value — since threading
// pendingDeaths/pendingSpawns/settlement-lifecycle data back out of tick()
// as a return value would be a signature change to the one function the
// spec explicitly says must have "no gameplay logic changes." Diffing costs
// two cheap Set/Map builds per tick and touches zero existing sim files.
//
// Settlement "merge" is represented as one settlement_dissolved event (the
// absorbed settlement disappears) — good enough resolution for "cheap...
// history/timelines later," not a requirement for perfect semantic event
// classification.

import type { EntityId } from "../types.ts";
import type { World } from "../sim/world.ts";
import type { Tier } from "../sim/systems/settlements.ts";
import type { EventRow } from "./db/events.ts";

export interface WorldSummary {
  citizenIds: Set<EntityId>;
  settlementIds: Set<number>;
  settlementTiers: Map<number, Tier>;
}

export function summarize(world: World): WorldSummary {
  const citizenIds = new Set<EntityId>();
  for (let slot = 0; slot < world.citizens.count; slot++) {
    citizenIds.add(world.citizens.id[slot]);
  }

  const settlementIds = new Set<number>();
  const settlementTiers = new Map<number, Tier>();
  for (const [id, rec] of world.settlements.settlements) {
    settlementIds.add(id);
    settlementTiers.set(id, rec.tier);
  }

  return { citizenIds, settlementIds, settlementTiers };
}

export function detectEvents(prev: WorldSummary, next: WorldSummary, tick: number): EventRow[] {
  const events: EventRow[] = [];

  for (const id of next.citizenIds) {
    if (!prev.citizenIds.has(id)) events.push({ tick, event_type: "birth", payload: { id } });
  }
  for (const id of prev.citizenIds) {
    if (!next.citizenIds.has(id)) events.push({ tick, event_type: "death", payload: { id } });
  }
  for (const id of next.settlementIds) {
    if (!prev.settlementIds.has(id)) {
      events.push({ tick, event_type: "settlement_founded", payload: { id, tier: next.settlementTiers.get(id) } });
    }
  }
  for (const id of prev.settlementIds) {
    if (!next.settlementIds.has(id)) {
      events.push({ tick, event_type: "settlement_dissolved", payload: { id } });
    }
  }

  return events;
}
