// The real v2 -> v3 migration (decorative ponds). Keyed FROM v2: this is the
// function to run when you're holding a v2 payload. Registered in index.ts
// under key `2`.
//
// A v2 world was generated before ponds existed, so there is no recorded
// water — same reasoning as v1.ts's lineage backfill: rather than guess
// where a pond might have gone, every cell is marked dry. The world just
// renders and simulates exactly as it always has; the next fresh world
// generated after this build gets an actual pond.

interface V2Payload {
  v: 2;
  terrain: {
    cols: number;
    rows: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function migrateV2ToV3(old: unknown): unknown {
  const snap = old as V2Payload;
  const cellCount = snap.terrain.cols * snap.terrain.rows;

  return {
    ...snap,
    v: 3,
    terrain: {
      ...snap.terrain,
      isWater: new Array<number>(cellCount).fill(0),
    },
  };
}
