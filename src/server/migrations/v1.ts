// The real v1 -> v2 migration (Phase 3, evolution). Keyed FROM v1: this is
// the function to run when you're holding a v1 payload. Registered in
// index.ts under key `1`.
//
// Two distinct jobs, and the second one is the subtle one:
//
//  1. Add the lineage columns (generation/birthTick/parentId), which simply
//     didn't exist in v1. Existing citizens are treated as founders — there
//     is no way to reconstruct a parentage graph that was never recorded,
//     and inventing one would be worse than admitting it's unknown.
//
//  2. RECOMPUTE metabolismRate from each citizen's genome. In v1 metabolism
//     was a flat global constant (0.3 for everyone) and the per-citizen
//     column, while present, was never read by any system. In v2 it is a
//     derived cost — see ../../sim/traits.ts — and metabolism.ts now reads it
//     every tick. Passing the stale flat 0.3 through unchanged would leave
//     migrated citizens permanently mispriced relative to their own traits
//     (and relative to every citizen born after the upgrade), quietly
//     corrupting the selection pressure the whole phase exists to create.

import { deriveMetabolismRate } from "../../sim/traits.ts";

interface V1Payload {
  v: 1;
  citizens: {
    count: number;
    fields: Record<string, number[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function migrateV1ToV2(old: unknown): unknown {
  const snap = old as V1Payload;
  const count = snap.citizens.count;
  const fields = snap.citizens.fields;

  // v1 always wrote these columns, but guard anyway: a corrupt or
  // hand-edited payload shouldn't produce NaN upkeep that silently starves
  // the whole population one tick after load.
  const visionRadius = fields.visionRadius ?? [];
  const speed = fields.speed ?? [];

  const metabolismRate = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    metabolismRate[i] = deriveMetabolismRate({
      visionRadius: visionRadius[i] ?? 0,
      speed: speed[i] ?? 0,
    });
  }

  return {
    ...snap,
    v: 2,
    citizens: {
      ...snap.citizens,
      fields: {
        ...fields,
        metabolismRate,
        // Pre-existing citizens are founders of the post-upgrade world: no
        // recorded parent, generation 0, and birthTick 0 (their true birth
        // tick was never stored either).
        generation: new Array<number>(count).fill(0),
        birthTick: new Array<number>(count).fill(0),
        parentId: new Array<number>(count).fill(-1),
      },
    },
  };
}
