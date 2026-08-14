// The plain, JSON-safe shape of a serialized World snapshot. This is the
// contract between serializeWorld/deserializeWorld (serialization.ts) and
// the SQLite storage layer (../db/snapshots.ts) — every field here must
// survive JSON.stringify/JSON.parse with no loss.
//
// This is deliberately NOT the wire format sent to browser clients
// (../../shared/wireFormat.ts) — that's a much smaller, render-relevant
// subset. SnapshotV1 aims for full fidelity: everything needed to resume
// the simulation bit-for-bit, including fields no renderer ever reads
// (citizen decide/carry/activity/memory state, settlement pendingClusters,
// RNG state).

export interface SnapshotV1 {
  v: 1;
  tick: number;
  /** mulberry32's entire internal state — see src/sim/rng.ts's Rng.getState(). */
  rngState: number;

  terrain: {
    cols: number;
    rows: number;
    cellSize: number;
    resource: number[];
    capacity: number[];
    pathWear: number[];
    // homeBoostScratch deliberately omitted: fully rebuilt by regrowTerrain()
    // on every call, carries zero information across a restart.
  };

  citizens: {
    capacity: number;
    count: number;
    nextEntityId: number;
    id: number[];
    fields: {
      x: number[];
      y: number[];
      heading: number[];
      resource: number[];
      age: number[];
      visionRadius: number[];
      speed: number[];
      metabolismRate: number[];
      targetX: number[];
      targetY: number[];
      hasTarget: number[];
      decideCountdown: number[];
      homeX: number[];
      homeY: number[];
      hasHome: number[];
      homeId: number[];
      carryingKind: number[];
      carryingQty: number[];
      activity: number[];
      gatherCountdown: number[];
      memCount: number[];
      memWriteIdx: number[];
    };
    memX: number[];
    memY: number[];
    // idToSlot deliberately omitted: rebuilt on load by iterating id[0..count).
  };

  materials: {
    capacity: number;
    count: number;
    nextEntityId: number;
    id: number[];
    fields: {
      x: number[];
      y: number[];
      kind: number[];
      quantity: number[];
    };
  };

  homes: {
    nextHomeId: number;
    homes: Array<
      [
        number,
        {
          id: number;
          x: number;
          y: number;
          buildProgress: number;
          complete: boolean;
          memberIds: number[];
          founderId: number;
        },
      ]
    >;
  };

  weather: {
    active: boolean;
    regionCx: number;
    regionCy: number;
    regionRadius: number;
    ticksRemaining: number;
    nextEventTick: number;
  };

  settlements: {
    nextId: number;
    nextPendingId: number;
    settlements: Array<
      [
        number,
        {
          id: number;
          name: string;
          foundingTick: number;
          centroidX: number;
          centroidY: number;
          tier: "hut" | "village" | "city";
          population: number;
          memberCellIndices: number[];
          graceTicksRemaining: number | null;
        },
      ]
    >;
    pendingClusters: Array<
      [
        number,
        {
          id: number;
          centroidX: number;
          centroidY: number;
          sustainedTicks: number;
        },
      ]
    >;
  };
}

/**
 * v2 — Phase 3 (evolution). Adds the three lineage columns to the citizen
 * store. Everything else is byte-identical to v1, expressed here as a delta
 * against SnapshotV1 rather than a copied-out full interface so the two
 * versions can't silently drift apart in the parts that didn't change.
 *
 * Note that no *gene* columns are added: visionRadius/speed/metabolismRate
 * already existed in v1 (they were stored, just never varied). What v2 adds
 * is the ability to say where a citizen came from — see ../migrations/v1.ts
 * for how existing worlds are brought forward.
 */
export interface SnapshotV2 extends Omit<SnapshotV1, "v" | "citizens"> {
  v: 2;
  citizens: Omit<SnapshotV1["citizens"], "fields"> & {
    fields: SnapshotV1["citizens"]["fields"] & {
      generation: number[];
      birthTick: number[];
      parentId: number[];
    };
  };
}

/**
 * v3 — decorative ponds. Adds `terrain.isWater`, a flat row-major 0/1 mask
 * the client needs to render water where the sim already zeroed out
 * resource/capacity (see generatePonds in ../../sim/terrain.ts). Everything
 * else is byte-identical to v2. A pre-v3 world has no recorded pond — see
 * ../migrations/v2.ts, which backfills an all-zero (no water) mask rather
 * than guessing where one might have gone.
 */
export interface SnapshotV3 extends Omit<SnapshotV2, "v" | "terrain"> {
  v: 3;
  terrain: SnapshotV2["terrain"] & {
    isWater: number[];
  };
}

/** The current, canonical snapshot shape. Bump this (and add a migration —
 * see ../migrations/) any time the shape changes. */
export type CurrentSnapshot = SnapshotV3;
