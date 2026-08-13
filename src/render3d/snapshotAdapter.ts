// WireSnapshotV1 -> engine input. Per the implementation plan's section on
// the adapter layer: this deliberately does NOT reshape WireSnapshotV1 into
// a kuku-shaped options object (nodes/links/adjacencyMap/clusters) — that
// mapping would be artificial, since Terrarium has no link graph. Instead
// world/engine.ts's applySnapshot() takes WireSnapshotV1 natively, and each
// world/*.ts file (terrain, homes, citizens, materials) does its own
// diff-by-id internally.
//
// For Phase 1, there's no cross-cutting adaptation logic that doesn't
// already belong inside a specific world/*.ts file, so this module holds
// only the one piece of real "adapting" work: computing engine options from
// sim constants, which main.ts would otherwise have to import directly.
//
// This will grow in later phases — e.g. Phase 2's citizen target-vs-visual
// position split (steering state that outlives any single applySnapshot
// call) is exactly the kind of adapter-layer state this file exists for.

import { CELL_SIZE, GRID_COLS, GRID_ROWS } from "../sim/constants.ts";
import type { Render3DWorldOptions } from "./world/engine.ts";

export function render3DWorldOptionsFromSimConstants(): Render3DWorldOptions {
  return {
    worldWidth: GRID_COLS * CELL_SIZE,
    worldHeight: GRID_ROWS * CELL_SIZE,
    cellSize: CELL_SIZE,
    cols: GRID_COLS,
    rows: GRID_ROWS,
  };
}
