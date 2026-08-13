// Click-to-select-and-follow a citizen — replaces render/selection.ts
// wholesale (confirmed the most pixi-viewport-coupled file in the old
// renderer: `viewport.follow()`, FederatedPointerEvent, `plugins.remove
// ("follow")`, none of which have a three.js equivalent). New version:
// pointer click -> raycast -> engine.pick() -> camera-follow by tweening
// controls.target toward the selected citizen's live anchor each frame
// (the user can still orbit/zoom while following — controls.target is the
// only thing driven programmatically — a small UX upgrade over the old
// renderer's fully-locked follow). Empty-space clicks (raycast hits nothing
// or hits only terrain) deselect directly; no stopPropagation trick needed,
// unlike Pixi's event bubbling.
//
// Also drives the ported world/indicators.ts selection-ring — a highlight
// the old 2D renderer never had at all (it only moved the camera and
// opened the stat panel); reusing the already-ported machinery for this is
// a free visual upgrade, not scope creep.

import { Raycaster, Vector2, type PerspectiveCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { StatPanel } from "../ui/statPanel.ts";
import type { CitizensHandle } from "./world/citizens.ts";
import type { InteractionIndicatorsHandle } from "./world/indicators.ts";

export interface Render3DSelection {
  getSelectedId(): number | null;
  selectCitizen(id: number): void;
  deselectCitizen(): void;
  /** Called once per animation frame — tweens the camera target toward the
   * selected citizen (if any) and refreshes the indicator ring. */
  update(nowSeconds: number): void;
  dispose(): void;
}

const INDICATOR_RADIUS = 1.6;

export function initRender3DSelection(
  canvas: HTMLCanvasElement,
  camera: PerspectiveCamera,
  controls: OrbitControls,
  citizens: CitizensHandle,
  indicators: InteractionIndicatorsHandle,
  statPanel: StatPanel,
): Render3DSelection {
  let selectedId: number | null = null;
  const raycaster = new Raycaster();
  const pointerNdc = new Vector2();

  function selectCitizen(id: number): void {
    const anchor = citizens.anchorFor(id);
    if (!anchor) return;
    selectedId = id;
    statPanel.show(id);
  }

  function deselectCitizen(): void {
    selectedId = null;
    indicators.clear();
    statPanel.hide();
  }

  function handleClick(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);

    const hitId = citizens.pick(raycaster);
    if (hitId !== null) {
      selectCitizen(hitId);
    } else {
      deselectCitizen();
    }
  }
  canvas.addEventListener("click", handleClick);

  function update(nowSeconds: number): void {
    if (selectedId === null) return;
    const anchor = citizens.anchorFor(selectedId);
    if (!anchor) {
      // Citizen died / left the latest snapshot — release selection rather
      // than following a stale, removed object. statPanel.update() (called
      // by main.ts with citizen-or-undefined) already handles the "no
      // longer present" case via onDeadTargetSelected; this covers the
      // camera/indicator side of the same event.
      deselectCitizen();
      return;
    }

    // Camera-follow: only the orbit target is driven programmatically —
    // distance/angle stay under user control, so the user can still
    // orbit/zoom around the followed citizen (unlike the old renderer's
    // fully-locked viewport.follow()).
    controls.target.copy(anchor.position);

    indicators.write(
      [{ kind: "selected", anchor: { position: anchor.position, radius: INDICATOR_RADIUS }, tone: "character" }],
      nowSeconds,
    );
  }

  function dispose(): void {
    canvas.removeEventListener("click", handleClick);
  }

  return {
    getSelectedId: () => selectedId,
    selectCitizen,
    deselectCitizen,
    update,
    dispose,
  };
}
