// setInterval-driven tick runner. tick() is a cheap, bounded, synchronous,
// no-I/O function at this population size, so setInterval drift/backpressure
// isn't a real risk — simpler than a recursive-setTimeout self-scheduler for
// no benefit here. Unlike src/sim/headlessRunner.ts's fixed-count loop, this
// runs indefinitely and yields to the event loop between ticks so the
// WebSocket server and SQLite writes (separately scheduled — see
// server/ws/server.ts and index.ts's snapshot interval) can interleave.

import { tick } from "../sim/tick.ts";
import type { World } from "../sim/world.ts";
import { SERVER_TICK_HZ } from "./constants.ts";

/** `onTick` runs once per tick, after tick() — used for event detection.
 * It does NOT do snapshot writes or broadcasts itself; those are separately
 * scheduled intervals, decoupled from tick rate per the design. */
export function startTickLoop(world: World, onTick: (world: World) => void): NodeJS.Timeout {
  const intervalMs = 1000 / SERVER_TICK_HZ;
  return setInterval(() => {
    tick(world);
    onTick(world);
  }, intervalMs);
}
