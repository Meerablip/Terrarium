// Event log writes. Append-only, cheap, one row per meaningful event
// (birth, death, settlement founded/dissolved). This is what gives real
// history/timelines later without ever needing to replay every tick.

import type Database from "better-sqlite3";

export interface EventRow {
  tick: number;
  event_type: string;
  payload: unknown;
}

export function appendEvents(db: Database.Database, events: EventRow[]): void {
  if (events.length === 0) return;

  const insert = db.prepare(`INSERT INTO events (tick, event_type, payload) VALUES (?, ?, ?)`);
  const insertMany = db.transaction((rows: EventRow[]) => {
    for (const row of rows) {
      insert.run(row.tick, row.event_type, JSON.stringify(row.payload));
    }
  });
  insertMany(events);
}
