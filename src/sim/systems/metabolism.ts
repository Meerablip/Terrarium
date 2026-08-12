// Rule 2: every citizen loses a fixed amount of resource per tick. A citizen
// whose resource drops to <= 0 is queued for death (id pushed to
// pendingDeaths) — this system never mutates the store's structure itself;
// see tick.ts for why death application is deferred.

import type { EntityId } from "../../types.ts";
import { METABOLISM_RATE } from "../constants.ts";
import type { CitizenStore } from "../ecs/store.ts";

export function applyMetabolism(store: CitizenStore, pendingDeaths: EntityId[]): void {
  for (let i = 0; i < store.count; i++) {
    const next = store.resource[i] - METABOLISM_RATE;
    store.resource[i] = next;
    store.age[i] += 1;
    if (next <= 0) {
      pendingDeaths.push(store.id[i]);
    }
  }
}
