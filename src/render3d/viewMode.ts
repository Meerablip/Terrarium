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

// Starting point for Phase 3 — camera distance (world units) beyond which
// individual citizens/homes/materials give way to settlement markers.
// Tuned against the camera's own distance bounds (camera.ts:
// minDistance=40, maxDistance ~= worldDiagonal*1.6 ~= 3621), roughly a
// third of the way to max zoom-out.
export const MAP_VIEW_DISTANCE_THRESHOLD = 900;

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
