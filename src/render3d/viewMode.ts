// Ground/map render-mode switch — adapted from render/viewMode.ts. Same
// shape (compute once immediately, then callback only when the mode
// actually flips, not on every camera change), but the threshold signal
// changes from pixi-viewport's `viewport.scaled` (a 2D zoom scalar) to
// camera distance from the OrbitControls target, since 3D has no single
// "zoom" scalar the way a 2D orthographic-ish camera does. See the
// implementation plan's section 3.2 for why MAP_VIEW_DISTANCE_THRESHOLD is
// a new render-side constant, not a reuse of sim/constants.ts's
// MAP_VIEW_ZOOM_THRESHOLD (the two aren't in comparable units).

import type { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type ViewMode = "ground" | "map";

// Camera distance (world units) beyond which individual citizens/homes/
// materials give way to settlement markers. Must sit above camera.ts's
// default framing distance (worldRadius * 0.85 ~= 962 for Terrarium's
// 1600x1600 world) — otherwise the app opens in map view by default, which
// doesn't match the old 2D renderer's behavior (pixi-viewport starts at
// scaled=1.0, well above MAP_VIEW_ZOOM_THRESHOLD=0.5, i.e. ground view).
// Found this the hard way: an untested "starting point" value here
// (900) sat just *under* the untested default framing distance,
// silently starting every session in map view. 1400 gives real headroom
// against camera.ts's ~962 default while still being reachable by zooming
// out (camera.ts's maxDistance ~= worldDiagonal*1.6 ~= 3621).
export const MAP_VIEW_DISTANCE_THRESHOLD = 1400;

export function getViewMode(camera: PerspectiveCamera, controls: OrbitControls): ViewMode {
  const distance = camera.position.distanceTo(controls.target);
  return distance > MAP_VIEW_DISTANCE_THRESHOLD ? "map" : "ground";
}

/** Invokes `callback` once immediately with the current mode, then again
 * only when the computed mode actually flips (not on every controls
 * "change" event). */
export function onViewModeChange(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  callback: (mode: ViewMode) => void,
): void {
  let current = getViewMode(camera, controls);
  callback(current);

  controls.addEventListener("change", () => {
    const next = getViewMode(camera, controls);
    if (next !== current) {
      current = next;
      callback(next);
    }
  });
}
