// The versioned wire format sent from server to browser client over
// WebSocket. Imported by both src/server/ws/server.ts (which builds it) and
// src/net/socket.ts (which consumes it) — one shared definition avoids
// drift between two hand-copied interface copies.
//
// Deliberately NOT the same shape as the SQLite SnapshotV1
// (../server/persistence/types.ts): this is a strict, named subset sized to
// the UNION of every render/UI consumer's actual field reads, not full sim
// fidelity. Citizens carry 6 fields (id/x/y/heading for rendering position,
// plus resource/age for the stat panel) — not the ~20-field CitizenStore.
// Settlements carry all 6 fields settlementLabels.ts needs (a superset of
// what settlementLayer.ts alone reads). No decide/carry/activity/memory
// state, no idToSlot, no rng state — none of that is ever rendered.
//
// Known, accepted tradeoff: the full terrain grid (cols*rows cells x 3
// arrays) is sent in full on every broadcast under this full-snapshot
// design — not delta-encoded. At the current grid size (100x100) this is
// acceptable for a hobby-scale single-VM deployment; revisit only if it
// becomes a measured problem, which would not require changing this
// interface's shape (e.g. a slower terrain-specific broadcast cadence).

export interface WireSnapshotV1 {
  v: 1;
  tick: number;

  citizens: Array<{
    id: number;
    x: number;
    y: number;
    heading: number;
    resource: number;
    age: number;
  }>;

  materials: Array<{
    id: number;
    x: number;
    y: number;
    kind: number;
  }>;

  homes: Array<{
    id: number;
    x: number;
    y: number;
    complete: boolean;
    /** buildProgress / HOME_COMPLETE_THRESHOLD, clamped to [0, 1]. The sim's
     * underlying accumulator keeps climbing past the threshold (deposits
     * don't stop once a home completes), so this is a normalized ratio for
     * rendering a fill bar, not the raw value. */
    buildProgress: number;
  }>;

  settlements: Array<{
    id: number;
    name: string;
    tier: "hut" | "village" | "city";
    population: number;
    centroidX: number;
    centroidY: number;
  }>;

  terrain: {
    cols: number;
    rows: number;
    cellSize: number;
    resource: number[];
    capacity: number[];
    pathWear: number[];
  };

  weather: {
    active: boolean;
    regionCx: number;
    regionCy: number;
    regionRadius: number;
  };
}
