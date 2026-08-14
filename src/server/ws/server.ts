// WebSocket server: broadcasts a full wire-format snapshot to every
// connected client on a fixed interval (BROADCAST_HZ), decoupled from the
// sim tick rate — not every tick needs to produce a network message. A
// freshly-connecting client gets a snapshot immediately, not just on the
// next scheduled broadcast, so a new tab renders right away instead of
// sitting blank for up to 100ms.

import { WebSocket, WebSocketServer } from "ws";
import type { World } from "../../sim/world.ts";
import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import { BROADCAST_HZ } from "../constants.ts";
import { HOME_COMPLETE_THRESHOLD } from "../../sim/constants.ts";

/** Reads the render-relevant slice of World into a plain, wire-shaped
 * object. Reads the flattened top-level CitizenStore aliases
 * (world.citizens.x[slot], matching how the existing render-layer sync
 * functions already read these fields) rather than .fields — safe here
 * since this is a one-time read-out into a brand-new array per broadcast,
 * not a "serialize the store" operation with a duplication risk. */
export function buildWireSnapshot(world: World): WireSnapshotV1 {
  const citizens: WireSnapshotV1["citizens"] = [];
  for (let slot = 0; slot < world.citizens.count; slot++) {
    citizens.push({
      id: world.citizens.id[slot],
      x: world.citizens.x[slot],
      y: world.citizens.y[slot],
      heading: world.citizens.heading[slot],
      resource: world.citizens.resource[slot],
      age: world.citizens.age[slot],
    });
  }

  const materials: WireSnapshotV1["materials"] = [];
  for (let slot = 0; slot < world.materials.count; slot++) {
    materials.push({
      id: world.materials.id[slot],
      x: world.materials.fields.x[slot],
      y: world.materials.fields.y[slot],
      kind: world.materials.fields.kind[slot],
    });
  }

  const homes: WireSnapshotV1["homes"] = Array.from(world.homes.homes.values()).map((h) => ({
    id: h.id,
    x: h.x,
    y: h.y,
    complete: h.complete,
    buildProgress: Math.min(h.buildProgress / HOME_COMPLETE_THRESHOLD, 1),
  }));

  const settlements: WireSnapshotV1["settlements"] = Array.from(world.settlements.settlements.values()).map(
    (s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      population: s.population,
      centroidX: s.centroidX,
      centroidY: s.centroidY,
    }),
  );

  return {
    v: 1,
    tick: world.tick,
    citizens,
    materials,
    homes,
    settlements,
    terrain: {
      cols: world.terrain.cols,
      rows: world.terrain.rows,
      cellSize: world.terrain.cellSize,
      resource: Array.from(world.terrain.resource),
      capacity: Array.from(world.terrain.capacity),
      pathWear: Array.from(world.terrain.pathWear),
      isWater: Array.from(world.terrain.isWater),
    },
    weather: {
      active: world.weather.active,
      regionCx: world.weather.regionCx,
      regionCy: world.weather.regionCy,
      regionRadius: world.weather.regionRadius,
    },
  };
}

export function startWebSocketServer(port: number, getWorld: () => World): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify(buildWireSnapshot(getWorld())));
  });

  return wss;
}

/** Starts the broadcast loop: one JSON.stringify per tick, the same string
 * sent to every connected client (not re-serialized per client). */
export function startBroadcastLoop(wss: WebSocketServer, getWorld: () => World): NodeJS.Timeout {
  return setInterval(() => {
    const payload = JSON.stringify(buildWireSnapshot(getWorld()));
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }, 1000 / BROADCAST_HZ);
}
