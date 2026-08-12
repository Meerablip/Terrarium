// Documents the citizen "component" shape. This is a typing/documentation aid
// only — actual storage is the parallel typed-array layout in store.ts, not
// object instances of these interfaces. Field indices are implicit: the same
// slot index into every array describes one citizen.
export interface CitizenComponents {
  /** Position.x, world units. */
  x: number;
  /** Position.y, world units. */
  y: number;
  /** Heading, radians. 0 = facing +x. Direction of last movement, or last
   * facing direction if currently stationary — never reset to 0 on its own. */
  heading: number;
  /** Vitals: current resource/health value. Citizen dies when this reaches <= 0. */
  resource: number;
  /** Age in ticks since spawn. */
  age: number;
}

/** Traits (Phase 2, rule 10): every citizen gets identical fixed values this
 * phase, but these are real per-citizen columns (not shared constants read
 * directly), so evolvable/varied traits later is an additive change, not a
 * refactor. */
export interface Traits {
  visionRadius: number;
  speed: number;
  metabolismRate: number;
}

/** This tick's cached movement destination — distinct from Memory, which is
 * a rolling list of *remembered past payoff locations*. decideTargets()
 * (visionMovementHarvest.ts) writes these at most once every
 * DECIDE_INTERVAL_TICKS; moveTowardTarget() reads them every tick. */
export interface DecideMoveCache {
  targetX: number;
  targetY: number;
  hasTarget: boolean; // stored as 0/1 in the actual Uint8Array
  decideCountdown: number;
}

/** Rolling, fixed-capacity (MEMORY_CAPACITY) list of resource locations that
 * paid off, stored as a ring buffer. Plain remembered coordinates — nothing
 * learned or trained. Backing storage (memX/memY) lives directly on
 * CitizenStore rather than in the generic SoA schema, since it's the only
 * multi-valued-per-entity field (see store.ts's header comment). */
export interface Memory {
  memCount: number; // how many of the MEMORY_CAPACITY slots are populated
  memWriteIdx: number; // next ring-buffer slot to overwrite, wraps 0..MEMORY_CAPACITY-1
}

/** Inert cargo, fully separate from `resource` (food/metabolism energy) — a
 * citizen carrying material doesn't starve slower or reproduce sooner. */
export interface Carrying {
  carryingKind: number; // -1 = not carrying anything, else an index into material kinds
  carryingQty: number;
}

/** Whether/where a citizen has a home. `homeX/homeY` is a read-cache of the
 * HomeRecord's position (see ../homes.ts), written once at attach time, so
 * the hot per-tick decide/move loop never needs a Map lookup into
 * HomeRegistry. HomeRegistry remains the source of truth for buildProgress/
 * complete/memberIds. */
export interface HomeLink {
  hasHome: boolean; // stored as 0/1
  homeId: number; // valid only when hasHome
  homeX: number;
  homeY: number;
}

/** Material gather/haul state machine (Phase 2, rule 3). One explicit field
 * rather than inferring state from a combination of other fields every tick. */
export const ACTIVITY_FORAGE = 0;
export const ACTIVITY_SEEK_MATERIAL = 1;
export const ACTIVITY_GATHERING = 2;
export const ACTIVITY_HAULING_HOME = 3;

export interface MaterialActivity {
  activity: number; // one of the ACTIVITY_* constants above
  gatherCountdown: number; // ticks remaining while activity === ACTIVITY_GATHERING
}

/** A discrete Material entity (MaterialStore, Phase 2 rule 3). `kind` is a
 * plain index into MATERIAL_KIND_COUNT — never a hardcoded switch anywhere
 * in gather/haul/deposit logic. */
export interface MaterialComponents {
  x: number;
  y: number;
  kind: number;
  quantity: number;
}
