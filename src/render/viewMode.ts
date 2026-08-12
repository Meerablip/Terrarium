// Ground/map render-mode switch (Phase 2, rule 9), driven by the current
// camera zoom level. Wired via pixi-viewport's own "zoomed" event rather
// than a per-frame poll: the event already fires exactly when zoom changes
// (wheel/pinch), giving correct, cheap mode switching instead of a 60Hz
// check for a value that changes rarely.

import type { Viewport } from "pixi-viewport";
import { MAP_VIEW_ZOOM_THRESHOLD } from "../sim/constants.ts";

export type ViewMode = "ground" | "map";

export function getViewMode(viewport: Viewport): ViewMode {
  return viewport.scaled < MAP_VIEW_ZOOM_THRESHOLD ? "map" : "ground";
}

/** Invokes `callback` once immediately with the current mode, then again
 * only when the computed mode actually flips (not on every zoom tick). */
export function onViewModeChange(viewport: Viewport, callback: (mode: ViewMode) => void): void {
  let current = getViewMode(viewport);
  callback(current);

  viewport.on("zoomed", () => {
    const next = getViewMode(viewport);
    if (next !== current) {
      current = next;
      callback(next);
    }
  });
}
