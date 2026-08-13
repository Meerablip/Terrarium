// Composition root. Wires the 3D renderer and UI together and renders
// whatever state arrives over the WebSocket connection to the world
// server — same sim/render split as before, just a different renderer.
//
// Phases 1-2 of the render3d cutover (see the implementation plan): sky,
// data-driven terrain, primitive citizens/homes/materials, camera pan/
// orbit/zoom, and smooth citizen movement (steer-toward-target between
// snapshots). No selection, no settlement markers/labels, no night cycle,
// no fire yet — those are later phases. The old Pixi renderer's files
// (src/render/*.ts) and its dependencies stay in the tree untouched for
// now, per the plan's rollback-safety guidance; nothing here imports them
// anymore.

import { createRender3DApp } from "./render3d/app.ts";
import { createRender3DCamera } from "./render3d/camera.ts";
import { render3DWorldOptionsFromSimConstants } from "./render3d/snapshotAdapter.ts";
import { createRender3DWorld } from "./render3d/world/engine.ts";
import { connectToServer } from "./net/socket.ts";

const WS_URL = `ws://${location.hostname}:8080`;

async function main(): Promise<void> {
  const appParent = document.getElementById("app");
  if (!appParent) throw new Error("Missing #app element in index.html");

  const options = render3DWorldOptionsFromSimConstants();
  const world = createRender3DWorld(options);

  const app = createRender3DApp(appParent, world.palette.fog);
  app.scene.add(world.group);

  const camera = createRender3DCamera(app.canvas, options.worldWidth, options.worldHeight);
  camera.frame(options.worldWidth / 2, options.worldHeight / 2, world.worldRadius);

  // Phase 3 wires latestState into selection/statPanel/settlementLabels; for
  // now applySnapshot is the only consumer of each incoming snapshot.
  connectToServer(WS_URL, (state) => {
    world.applySnapshot(state);
  });

  // Real elapsed time between frames, not a hardcoded 1/60 — rAF doesn't
  // guarantee 60fps, and citizens.ts's capped-speed steering needs the
  // actual delta or visual movement speed drifts from STEER_SPEED whenever
  // the frame rate isn't exactly 60. Clamped to avoid a huge step after a
  // backgrounded-tab pause (mirrors kuku's own clamp in engine.ts).
  let lastFrameMs: number | null = null;
  function frame(nowMs: number): void {
    const nowSeconds = nowMs / 1000;
    const deltaSeconds = lastFrameMs === null ? 1 / 60 : Math.min((nowMs - lastFrameMs) / 1000, 0.12);
    lastFrameMs = nowMs;

    world.update(nowSeconds, deltaSeconds);
    camera.controls.update();
    app.render(camera.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("Failed to start Terrarium client:", err);
});
