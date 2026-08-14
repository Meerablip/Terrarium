// Pixi application bootstrap.
//
// Two settings here are load-bearing for pixel art and easy to get wrong:
//
//  - `TextureSource.defaultOptions.scaleMode = "nearest"` — without it Pixi
//    bilinear-filters every upscaled texture and 16px tiles turn into a
//    smeared mess at the 3-4x zoom this renderer runs at. It's set globally
//    rather than per-texture because it has to apply to every sheet sliced in
//    assets.ts, including ones added later.
//  - `roundPixels` — keeps sprites on whole-pixel boundaries so tile seams
//    don't shimmer while the camera pans.
//
// `antialias` is deliberately OFF (the opposite of the old renderer's
// setting): antialiasing a pixel-art scene only softens edges that are meant
// to be hard.

import { Application, TextureSource } from "pixi.js";

/** Background behind the world — only visible past the world's edges. A
 * muted green so the map doesn't sit on a jarring void. */
export const BACKGROUND_COLOR = 0x3b6b3b;

export async function createPixiApp(parent: HTMLElement): Promise<Application> {
  // Must be set BEFORE any texture is created, so it applies to every sheet
  // loaded in assets.ts.
  TextureSource.defaultOptions.scaleMode = "nearest";

  const app = new Application();
  await app.init({
    background: BACKGROUND_COLOR,
    resizeTo: window,
    antialias: false,
    roundPixels: true,
    // Pixel art wants integer device pixels; autoDensity + a fractional DPR
    // reintroduces the sub-pixel sampling nearest-neighbour is meant to avoid.
    resolution: Math.max(1, Math.floor(window.devicePixelRatio || 1)),
    autoDensity: true,
  });

  parent.appendChild(app.canvas);
  return app;
}
