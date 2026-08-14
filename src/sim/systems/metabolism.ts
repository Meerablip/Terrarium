// Rule 2: every citizen loses resource per tick. A citizen whose resource
// drops to <= 0 is queued for death (id pushed to pendingDeaths) — this
// system never mutates the store's structure itself; see tick.ts for why
// death application is deferred.
//
// Phase 3 changes two things here, both required for selection to exist:
//
//  1. Upkeep is now the citizen's OWN metabolismRate (derived from its
//     genome, see ../traits.ts) rather than a flat global constant. The
//     per-citizen column already existed but was never read — every citizen
//     was charged the same METABOLISM_RATE regardless of its traits, which
//     meant carrying a huge visionRadius or speed was completely free and no
//     trait could ever be selected against.
//
//  2. Senescence: upkeep rises with age past SENESCENCE_ONSET_TICKS. Without
//     it there is no lifespan — `age` was incremented every tick and read by
//     nothing, and citizens observed in a long-running world were ~300,000
//     ticks old and functionally immortal. Immortal agents make generations
//     meaningless, which makes generational selection meaningless.
//
// Senescence is modelled as rising upkeep rather than a random death roll on
// purpose: it costs no RNG draws (keeping the seeded stream cheap and the
// tick deterministic), and it kills the frail *through the same resource
// channel as everything else* — an old citizen with excellent foraging
// traits can still pay its way for a while, which is exactly the kind of
// trait-dependent survival difference selection needs.

import type { EntityId } from "../../types.ts";
import { SENESCENCE_MAX_MULTIPLIER, SENESCENCE_ONSET_TICKS, SENESCENCE_PER_TICK } from "../constants.ts";
import type { CitizenStore } from "../ecs/store.ts";

/** Upkeep multiplier from age alone. 1.0 until onset, then rising linearly,
 * capped so a very old citizen's upkeep can't diverge without bound. */
export function senescenceMultiplier(age: number): number {
  if (age <= SENESCENCE_ONSET_TICKS) return 1;
  const multiplier = 1 + (age - SENESCENCE_ONSET_TICKS) * SENESCENCE_PER_TICK;
  return multiplier > SENESCENCE_MAX_MULTIPLIER ? SENESCENCE_MAX_MULTIPLIER : multiplier;
}

export function applyMetabolism(store: CitizenStore, pendingDeaths: EntityId[]): void {
  for (let i = 0; i < store.count; i++) {
    const age = store.age[i] + 1;
    store.age[i] = age;

    const upkeep = store.metabolismRate[i] * senescenceMultiplier(age);
    const next = store.resource[i] - upkeep;
    store.resource[i] = next;

    if (next <= 0) {
      pendingDeaths.push(store.id[i]);
    }
  }
}
