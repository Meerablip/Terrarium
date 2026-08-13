// Composition root. Wires the 3D renderer and UI together and renders
// whatever state arrives over the WebSocket connection to the world
// server — same sim/render split as before, just a different renderer.
//
// Phases 1-4 of the render3d cutover (see the implementation plan): sky,
// data-driven terrain, primitive citizens/homes/materials/settlements,
// camera pan/orbit/zoom, smooth citizen movement, click-to-select-and-follow,
// ground/map LOD, settlement name labels, and a tick-driven day/night cycle
// (world.update() blends the palette every frame; this file just re-reads
// world.palette each frame to keep the sky/fog in sync — see
// render3d/world/engine.ts for where the actual blending happens). No fire
// yet — that's Phase 5. The old Pixi renderer's files (src/render/*.ts) and
// its dependencies stay in the tree untouched for now, per the plan's
// rollback-safety guidance; nothing here imports them anymore.

import { createRender3DApp } from "./render3d/app.ts";
import { createRender3DCamera } from "./render3d/camera.ts";
import { initRender3DSelection } from "./render3d/selection.ts";
import { render3DWorldOptionsFromSimConstants } from "./render3d/snapshotAdapter.ts";
import { getViewMode, onViewModeChange } from "./render3d/viewMode.ts";
import { createRender3DWorld } from "./render3d/world/engine.ts";
import { connectToServer, type ClientWorldState } from "./net/socket.ts";
import { createStatPanel } from "./ui/statPanel.ts";
import {
  createSettlementLabelOverlay,
  repositionSettlementLabels,
  syncSettlementLabelOverlay,
} from "./ui/settlementLabels.ts";

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

  // selection and statPanel each need a handle to the other (selection
  // shows/hides the panel; the panel's "stop following" button needs to
  // call back into deselectCitizen) — same forwarding-closure pattern the
  // old 2D main.ts used to break the cycle.
  let deselect = () => {};
  const statPanel = createStatPanel(() => deselect());
  const selection = initRender3DSelection(
    app.canvas,
    camera.camera,
    camera.controls,
    world.citizens,
    world.indicators,
    statPanel,
  );
  deselect = () => selection.deselectCitizen();

  const settlementLabelOverlay = createSettlementLabelOverlay();

  let latestState: ClientWorldState | null = null;

  onViewModeChange(camera.camera, camera.controls, (mode) => {
    world.groundLayers.visible = mode === "ground";
    world.mapLayers.visible = mode === "map";
    if (latestState) {
      syncSettlementLabelOverlay(
        settlementLabelOverlay,
        latestState.settlements,
        camera.camera,
        app.canvas.clientWidth,
        app.canvas.clientHeight,
        mode,
      );
    }
  });

  connectToServer(WS_URL, (state) => {
    latestState = state;
    world.applySnapshot(state);

    const mode = getViewMode(camera.camera, camera.controls);
    syncSettlementLabelOverlay(
      settlementLabelOverlay,
      state.settlements,
      camera.camera,
      app.canvas.clientWidth,
      app.canvas.clientHeight,
      mode,
    );

    const selectedId = selection.getSelectedId();
    if (selectedId !== null) {
      const citizen = state.citizens.find((c) => c.id === selectedId);
      statPanel.update(citizen);
    }
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
    app.applyAtmosphere(world.palette.fog, world.palette.fogDensity);
    selection.update(nowSeconds);
    camera.controls.update();
    app.render(camera.camera);

    // Pure screen-space math, no sim coupling — stays on the render loop so
    // labels track smoothly while orbiting/zooming between server
    // snapshots, same reasoning as the old 2D renderer's app.ticker hook.
    repositionSettlementLabels(
      settlementLabelOverlay,
      camera.camera,
      app.canvas.clientWidth,
      app.canvas.clientHeight,
    );

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("Failed to start Terrarium client:", err);
});
