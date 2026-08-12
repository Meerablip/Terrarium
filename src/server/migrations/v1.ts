// Placeholder documenting the migration pattern for the first REAL future
// migration. There is nothing to migrate from yet — SnapshotV1 is the only
// version that has ever existed — so nothing here is registered in
// index.ts's `migrations` map. This file exists purely so the pattern is
// visible and easy to copy when phase 3 (or any future phase) adds a new
// field to the sim.
//
// WORKED EXAMPLE (illustrative only — do not uncomment/register this as
// real logic; it's fictional). Imagine Phase 2's citizen traits/memory/
// carrying fields had been added to CITIZEN_SCHEMA *after* a v1 snapshot
// format already existed without them. The migration that upgrades an old
// v1 payload to the new v2 shape would look like this:
//
// import { VISION_RADIUS, MOVE_SPEED, METABOLISM_RATE, MEMORY_CAPACITY } from "../../sim/constants.ts";
//
// function migrateV1ToV2(old: unknown): unknown {
//   const snap = old as {
//     v: 1;
//     citizens: { count: number; fields: Record<string, number[]> };
//     [key: string]: unknown;
//   };
//   const count = snap.citizens.count;
//   return {
//     ...snap,
//     v: 2,
//     citizens: {
//       ...snap.citizens,
//       fields: {
//         ...snap.citizens.fields,
//         // Every genuinely new field gets an explicit, sim-rule-informed
//         // default — the same defaults createWorld() itself uses for
//         // freshly-spawned citizens, so migrated old citizens become
//         // indistinguishable from ones simulated with the new fields from
//         // birth.
//         visionRadius: new Array(count).fill(VISION_RADIUS),
//         speed: new Array(count).fill(MOVE_SPEED),
//         metabolismRate: new Array(count).fill(METABOLISM_RATE),
//         carryingKind: new Array(count).fill(-1), // "not carrying" sentinel
//         carryingQty: new Array(count).fill(0),
//         activity: new Array(count).fill(0), // default/idle activity enum value
//         gatherCountdown: new Array(count).fill(0),
//         memCount: new Array(count).fill(0),
//         memWriteIdx: new Array(count).fill(0),
//       },
//       memX: new Array(count * MEMORY_CAPACITY).fill(0),
//       memY: new Array(count * MEMORY_CAPACITY).fill(0),
//     },
//   };
// }
//
// This proves the pattern: every untouched field passes through via spread,
// every new field gets an explicit default, and the function is named and
// keyed unambiguously to the version transition it performs
// (migrateV1ToV2, registered under key `1` in index.ts's `migrations` map
// since it's "the migration to run when you're holding a v1 payload").
export {};
