// Composition root. Wires the renderer and UI together and renders whatever
// state arrives over the WebSocket connection to the world server — this
// file no longer calls tick() anywhere; the simulation lives entirely on
// the server now (see src/server/). Same sim/render split as before, just
// stretched across the network: this file's job is purely "take the latest
// snapshot, hand its fields to the render/UI layers."

import { CELL_SIZE, GRID_COLS, GRID_ROWS } from "./sim/constants.ts";
import { createPixiApp } from "./render/app.ts";
import { createViewport } from "./render/viewportSetup.ts";
import { createTerrainLayer, updateTerrainLayer } from "./render/terrainLayer.ts";
import { createCitizenLayer, syncCitizenLayer } from "./render/citizenLayer.ts";
import { createMaterialLayer, syncMaterialLayer } from "./render/materialLayer.ts";
import { createHomeLayer, syncHomeLayer } from "./render/homeLayer.ts";
import { createSettlementLayer, syncSettlementLayer } from "./render/settlementLayer.ts";
import { onViewModeChange } from "./render/viewMode.ts";
import { initSelection } from "./render/selection.ts";
import { createStatPanel } from "./ui/statPanel.ts";
import { createSettlementLabelOverlay, repositionSettlementLabels, syncSettlementLabelOverlay } from "./ui/settlementLabels.ts";
import { connectToServer, type ClientWorldState } from "./net/socket.ts";

const WS_URL = `ws://${location.hostname}:8080`;

async function main(): Promise<void> {
  const appParent = document.getElementById("app");
  if (!appParent) throw new Error("Missing #app element in index.html");

  const app = await createPixiApp(appParent);

  // World dimensions are fixed by sim constants, not something we need to
  // wait for the first server message to learn.
  const worldWidth = GRID_COLS * CELL_SIZE;
  const worldHeight = GRID_ROWS * CELL_SIZE;
  const viewport = createViewport(app, worldWidth, worldHeight);

  // Ground-view layers, added in fixed z-order: terrain (under everything),
  // then materials, then homes, then citizens (on top).
  const terrainLayer = createTerrainLayer({ cols: GRID_COLS, rows: GRID_ROWS, cellSize: CELL_SIZE, resource: [], capacity: [], pathWear: [] });
  viewport.addChild(terrainLayer);

  const materialLayer = createMaterialLayer();
  viewport.addChild(materialLayer.container);

  const homeLayer = createHomeLayer();
  viewport.addChild(homeLayer.container);

  const citizenLayer = createCitizenLayer();
  viewport.addChild(citizenLayer.container);

  // Map-view-only layer, also added to the viewport so it pans/zooms with
  // the world; visibility toggled by the view-mode subscription below.
  const settlementLayer = createSettlementLayer();
  viewport.addChild(settlementLayer);

  const settlementLabelOverlay = createSettlementLabelOverlay();

  // selection and statPanel each need a handle to the other (selection
  // shows/hides the panel; the panel's "stop following" button and its
  // dead-target callback both need to call back into deselectCitizen).
  // Break the cycle with a forwarding closure: statPanel is created first
  // with a callback that forwards to selection once selection exists.
  let deselect = () => {};
  const statPanel = createStatPanel(() => deselect());
  const selection = initSelection(viewport, citizenLayer, statPanel);
  deselect = () => selection.deselectCitizen();

  let latestState: ClientWorldState | null = null;

  onViewModeChange(viewport, (mode) => {
    citizenLayer.container.visible = mode === "ground";
    materialLayer.container.visible = mode === "ground";
    homeLayer.container.visible = mode === "ground";
    settlementLayer.visible = mode === "map";
    if (latestState) {
      syncSettlementLabelOverlay(settlementLabelOverlay, latestState.settlements, viewport, mode);
    }
  });

  connectToServer(WS_URL, (state) => {
    latestState = state;

    syncCitizenLayer(citizenLayer, state.citizens, (id) => selection.selectCitizen(id));
    syncMaterialLayer(materialLayer, state.materials);
    syncHomeLayer(homeLayer, state.homes);
    updateTerrainLayer(terrainLayer, state.terrain, state.weather);
    syncSettlementLayer(settlementLayer, state.settlements, state.terrain);

    const mode = settlementLayer.visible ? "map" : "ground";
    syncSettlementLabelOverlay(settlementLabelOverlay, state.settlements, viewport, mode);

    const selectedId = selection.getSelectedId();
    if (selectedId !== null) {
      const citizen = state.citizens.find((c) => c.id === selectedId);
      statPanel.update(citizen);
    }
  });

  // Pure screen-space math, no sim coupling — stays on the render loop so
  // labels track smoothly while panning/zooming between server snapshots.
  app.ticker.add(() => {
    repositionSettlementLabels(settlementLabelOverlay, viewport);
  });
}

main().catch((err) => {
  console.error("Failed to start Terrarium client:", err);
});
