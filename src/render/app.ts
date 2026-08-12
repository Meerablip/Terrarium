// Pixi.js application bootstrap. This directory reads sim state and draws it
// — nothing under /src/render should ever write to World or its component
// arrays; treat everything from /src/sim as read-only here.

import { Application } from "pixi.js";
import { BACKGROUND_COLOR } from "./colors.ts";

export async function createPixiApp(parent: HTMLElement): Promise<Application> {
  const app = new Application();

  await app.init({
    background: BACKGROUND_COLOR,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  parent.appendChild(app.canvas);
  return app;
}
