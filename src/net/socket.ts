// Browser-side WebSocket connection. A new top-level directory alongside
// sim/render/ui — network transport is a genuinely new concern that
// belongs in neither: render/ is Pixi-drawing-only, ui/ is DOM-overlay-only.
//
// Reconnects on drop with a fixed 2-second delay, not exponential backoff —
// this is a hobby-scale single-VM project, not a service where
// backoff-storm avoidance matters; a constant delay is the simplest thing
// that satisfies "reconnect-on-drop" and is trivial to verify by
// killing/restarting the server.

import type { WireSnapshotV1 } from "../shared/wireFormat.ts";

export type ClientWorldState = WireSnapshotV1;

const RECONNECT_DELAY_MS = 2000;

export function connectToServer(url: string, onSnapshot: (state: ClientWorldState) => void): void {
  const connect = () => {
    const socket = new WebSocket(url);

    socket.addEventListener("message", (event) => {
      let msg: WireSnapshotV1;
      try {
        msg = JSON.parse(event.data as string) as WireSnapshotV1;
      } catch (err) {
        console.warn("Failed to parse server message:", err);
        return;
      }
      if (msg.v !== 1) {
        console.warn(`Unsupported wire format version ${msg.v}, ignoring message.`);
        return;
      }
      onSnapshot(msg);
    });

    socket.addEventListener("close", () => {
      console.warn(`WebSocket closed, reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
      setTimeout(connect, RECONNECT_DELAY_MS);
    });

    socket.addEventListener("error", () => {
      socket.close(); // triggers the close handler's retry
    });
  };

  connect();
}
