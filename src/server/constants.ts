// Server-process configuration. These are NOT simulation rules (nothing
// here is imported by src/sim/), so they deliberately live outside
// src/sim/constants.ts — tick cadence, broadcast rate, and persistence
// intervals are a server-process concern, not something the sim itself
// needs to know about. Env vars (read in index.ts) override the two
// deployment-relevant defaults below.

/** Ticks per second the server advances the simulation. Matches the value
 * the game was originally tuned at client-side (formerly SIM_TICK_HZ in
 * src/sim/constants.ts, which is deleted now that nothing client-side runs
 * its own tick loop) — no reason to retune simulation feel as part of a
 * pure extraction task. */
export const SERVER_TICK_HZ = 20;

/** How often the server broadcasts a full wire-format snapshot to
 * connected WebSocket clients. Decoupled from SERVER_TICK_HZ — the sim can
 * tick fast without every tick producing a network message. */
export const BROADCAST_HZ = 10;

/** How often (in sim ticks) the server writes a full snapshot to SQLite.
 * 1200 ticks at 20Hz = once per minute. */
export const SNAPSHOT_INTERVAL_TICKS = 1200;

export const DEFAULT_PORT = 8080;
export const DEFAULT_DB_PATH = "data/terrarium.db";
