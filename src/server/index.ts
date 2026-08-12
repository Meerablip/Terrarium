// Composition root: startup sequence, wiring, and signal handlers. Run via
// `npm run server` (tsx src/server/index.ts). Imports src/sim/ as-is — this
// is a wiring/hosting task, not a sim redesign; no gameplay logic lives here.

import { createWorld } from "../sim/world.ts";
import { openDatabase } from "./db/connection.ts";
import { appendEvents } from "./db/events.ts";
import { loadLatestSnapshot, writeSnapshot } from "./db/snapshots.ts";
import { detectEvents, summarize, type WorldSummary } from "./eventDetection.ts";
import { runMigrations } from "./migrations/index.ts";
import { deserializeWorld, serializeWorld } from "./persistence/serialization.ts";
import { startTickLoop } from "./tickLoop.ts";
import { getWorld, setWorld } from "./worldState.ts";
import { startBroadcastLoop, startWebSocketServer } from "./ws/server.ts";
import { DEFAULT_DB_PATH, DEFAULT_PORT, SNAPSHOT_INTERVAL_TICKS } from "./constants.ts";
import type { CurrentSnapshot } from "./persistence/types.ts";

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

async function main(): Promise<void> {
  const db = openDatabase(DB_PATH);

  const stored = loadLatestSnapshot(db);
  let world;
  if (stored) {
    const migrated = runMigrations({ v: stored.version, ...(stored.data as object) }) as CurrentSnapshot;
    world = deserializeWorld(migrated);
    console.log(`Loaded snapshot at tick ${world.tick} (version ${stored.version}).`);
  } else {
    world = createWorld();
    console.log(`No snapshot found — creating a fresh world (seed default), starting at tick 0.`);
  }
  setWorld(world);

  const wss = startWebSocketServer(PORT, getWorld);
  console.log(`WebSocket server listening on port ${PORT}.`);
  startBroadcastLoop(wss, getWorld);

  let lastSummary: WorldSummary = summarize(getWorld());

  const tickTimer = startTickLoop(world, (w) => {
    const nextSummary = summarize(w);
    const events = detectEvents(lastSummary, nextSummary, w.tick);
    if (events.length > 0) appendEvents(db, events);
    lastSummary = nextSummary;

    if (w.tick % SNAPSHOT_INTERVAL_TICKS === 0) {
      writeSnapshot(db, serializeWorld(w));
      console.log(`tick ${w.tick}: wrote periodic snapshot (population=${w.citizens.count}, settlements=${w.settlements.settlements.size})`);
    }
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, writing final snapshot and exiting...`);
    clearInterval(tickTimer);
    writeSnapshot(db, serializeWorld(getWorld()));
    db.close();
    wss.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(`Terrarium world server running. Tick ${world.tick}, population ${world.citizens.count}.`);
}

main().catch((err) => {
  console.error("Failed to start Terrarium world server:", err);
  process.exit(1);
});
