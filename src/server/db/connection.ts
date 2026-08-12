// SQLite connection setup. WAL mode is used both because it's the right
// mode for a write-heavy process with concurrent read access (e.g.
// inspecting the DB via the sqlite3 CLI while the server runs) and because
// it's required context for the backup-safety note in deploy/README.md
// (a raw `cp` of the .db file is unsafe under WAL — see that file).

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_tick ON snapshots (tick DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_tick ON events (tick);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
`;

export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}
