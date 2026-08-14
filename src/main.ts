// Composition root. Wires the Pixi renderer to the world server's WebSocket
// feed. Same sim/render split as always: nothing here ticks the simulation,
// it only draws whatever snapshot last arrived.
//
// Two cadences, deliberately separate:
//  - the socket callback (BROADCAST_HZ, 10/s) reconciles *what exists* —
//    which citizens/materials/homes exist, where the snapshot says they are;
//  - the render ticker (per frame) advances *how it looks* — interpolated
//    citizen positions/animation, and slow decorative grass-patch growth.
// Collapsing these into one is what made agents skip in the previous
// renderer; see citizenLayer.ts.

import { Container } from "pixi.js";

import { connectToServer, type ClientWorldState } from "./net/socket.ts";
import { createPixiApp } from "./render/app.ts";
import { ensureAssetsLoaded } from "./render/assets.ts";
import { createViewport } from "./render/camera.ts";
import { createCitizenLayer, syncCitizenLayer, updateCitizenLayer } from "./render/citizenLayer.ts";
import { createHomesLayer, syncHomesLayer } from "./render/homesLayer.ts";
import { createMaterialsLayer, syncMaterialsLayer } from "./render/materialsLayer.ts";
import { createNatureLayer, syncNatureLayer } from "./render/natureLayer.ts";
import { createTerrainLayer, syncTerrainLayer, updateTerrainLayer } from "./render/terrainLayer.ts";

const WS_URL = `ws://${location.hostname}:8080`;

async function main(): Promise<void> {
  const appParent = document.getElementById("app");
  if (!appParent) throw new Error("Missing #app element in index.html");

  const app = await createPixiApp(appParent);
  // Every layer slices textures out of these sheets, so nothing may be
  // constructed before this resolves.
  await ensureAssetsLoaded();

  // World dimensions aren't known until the first snapshot (world size is
  // configurable server-side), so the viewport is created lazily.
  let viewport: ReturnType<typeof createViewport> | null = null;

  const terrain = createTerrainLayer();

  // Everything that sorts by ground position shares one container, so
  // citizens, houses and trees interleave correctly by depth rather than
  // each category being stuck in its own flat stratum.
  const entityLayer = new Container();
  entityLayer.sortableChildren = true;

  const citizens = createCitizenLayer(entityLayer);
  const materials = createMaterialsLayer(entityLayer);
  const homes = createHomesLayer(entityLayer);
  const nature = createNatureLayer(entityLayer);

  connectToServer(WS_URL, (state: ClientWorldState) => {
    if (!viewport) {
      const worldWidth = state.terrain.cols * state.terrain.cellSize;
      const worldHeight = state.terrain.rows * state.terrain.cellSize;
      viewport = createViewport(app, worldWidth, worldHeight);
      viewport.addChild(terrain.container);
      viewport.addChild(entityLayer);
    }

    syncTerrainLayer(terrain, state.terrain, state.homes);
    syncNatureLayer(nature, terrain);
    syncMaterialsLayer(materials, state.materials);
    syncHomesLayer(homes, state.homes);
    syncCitizenLayer(citizens, state.citizens, (id) => {
      console.log(`selected citizen ${id}`);
    });
  });

  app.ticker.add((ticker) => {
    // Real elapsed seconds, clamped so a backgrounded tab doesn't resume with
    // one enormous step that flings every sprite to its target at once.
    const deltaSeconds = Math.min(ticker.deltaMS / 1000, 0.25);
    updateCitizenLayer(citizens, deltaSeconds);
    updateTerrainLayer(terrain, deltaSeconds);
  });

}

main().catch((err) => {
  console.error("Failed to start Terrarium client:", err);
});
