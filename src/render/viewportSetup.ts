// pixi-viewport instantiation and camera plugin configuration. Read-only
// against sim state — this file only sets up the container hierarchy and
// interaction plugins; per-frame syncing from sim state lives in
// terrainLayer.ts / citizenLayer.ts.

import type { Application } from "pixi.js";
import { Viewport } from "pixi-viewport";

export function createViewport(app: Application, worldWidth: number, worldHeight: number): Viewport {
  // pixi-viewport 6.x requires `events` passed explicitly — it no longer
  // auto-detects Pixi's interaction manager the way older versions did.
  const viewport = new Viewport({
    screenWidth: app.screen.width,
    screenHeight: app.screen.height,
    worldWidth,
    worldHeight,
    events: app.renderer.events,
  });

  app.stage.addChild(viewport);

  viewport
    .drag()
    .pinch()
    .wheel()
    .clampZoom({ minScale: 0.2, maxScale: 6 })
    .clamp({ direction: "all" });

  // Center the camera on the world at startup.
  viewport.moveCenter(worldWidth / 2, worldHeight / 2);

  return viewport;
}
