// Ties sim entity id -> render sprite -> DOM stat panel -> camera together.
// Read-only against sim state (it looks citizens up by id, never mutates the
// store). This is the trickiest cross-directory wiring in the project.

import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CitizenLayer } from "./citizenLayer.ts";
import type { StatPanel } from "../ui/statPanel.ts";
import type { EntityId } from "../types.ts";

export interface Selection {
  getSelectedId(): EntityId | null;
  selectCitizen(id: EntityId): void;
  deselectCitizen(): void;
}

/**
 * Wires up:
 *  - click-empty-space-to-deselect on the viewport itself (triangle click
 *    handlers, registered per-sprite in citizenLayer.ts, call
 *    event.stopPropagation() so a click landing on a citizen doesn't also
 *    bubble up and immediately deselect via this handler)
 *  - selectCitizen(id): locks the camera to follow that citizen's sprite and
 *    opens the stat panel
 *  - deselectCitizen(): releases the camera and closes the panel
 */
export function initSelection(viewport: Viewport, citizenLayer: CitizenLayer, statPanel: StatPanel): Selection {
  let selectedId: EntityId | null = null;

  function selectCitizen(id: EntityId): void {
    const sprite = citizenLayer.sprites.get(id);
    if (!sprite) return;

    selectedId = id;

    // NOTE: pixi-viewport's `follow()` only applies `acceleration` easing
    // when `speed > 0` — a `speed: 0` config teleports instantly to the
    // target regardless of acceleration. A nonzero speed paired with
    // acceleration is what actually produces smooth camera-follow easing.
    viewport.follow(sprite, { speed: 8, acceleration: 0.08, radius: 0 });

    statPanel.show(id);
  }

  function deselectCitizen(): void {
    selectedId = null;
    viewport.plugins.remove("follow");
    statPanel.hide();
  }

  viewport.eventMode = "static";
  viewport.on("pointertap", (event: FederatedPointerEvent) => {
    // Only deselect if the click landed on the viewport itself (empty
    // space), not on a citizen sprite that already stopped propagation.
    if (event.target === viewport) {
      deselectCitizen();
    }
  });

  return {
    getSelectedId: () => selectedId,
    selectCitizen,
    deselectCitizen,
  };
}
