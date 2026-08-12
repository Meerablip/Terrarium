// Snapshot read/write. writeSnapshot inserts a new row (snapshots are
// append-only — we never overwrite an old one, so history/rollback is
// always available in principle, even though this pass only ever reads the
// most recent one on startup). loadLatestSnapshot is the one hot query path.

import type Database from "better-sqlite3";
import type { CurrentSnapshot } from "../persistence/types.ts";

export interface StoredSnapshot {
  version: number;
  data: unknown;
}

export function writeSnapshot(db: Database.Database, snapshot: CurrentSnapshot): void {
  db.prepare(`INSERT INTO snapshots (tick, version, data) VALUES (?, ?, ?)`).run(
    snapshot.tick,
    snapshot.v,
    JSON.stringify(snapshot),
  );
}

export function loadLatestSnapshot(db: Database.Database): StoredSnapshot | null {
  const row = db
    .prepare(`SELECT version, data FROM snapshots ORDER BY tick DESC LIMIT 1`)
    .get() as { version: number; data: string } | undefined;

  if (!row) return null;
  return { version: row.version, data: JSON.parse(row.data) };
}
