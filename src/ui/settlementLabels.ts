// Map-view-only DOM overlay: per-settlement, world-position-tracked name
// labels. Unlike statPanel.ts's single fixed-corner card, this is a pool of
// absolutely-positioned divs, one per registered settlement, repositioned
// every frame from the 3D camera's projection. Read-only against sim/
// registry state — only ever reads registry.settlements (Map iteration);
// writes exclusively to its own DOM elements.
//
// Adapted for render3d (see the implementation plan's section 4): the only
// change from the original 2D version is repositionSettlementLabels'
// single `viewport.toScreen(x, y)` call (pixi-viewport's pure 2D affine
// transform, always on-screen-safe) becoming a `Vector3.project(camera)` ->
// NDC -> pixel conversion, which needs (a) a world-space label height (2D
// never had a Z-axis to float above) and (b) an explicit behind-camera
// guard, since projecting a point behind the camera can otherwise map to a
// flipped on-screen position — a failure mode pixi-viewport's 2D transform
// never had. Every other line (create/destroy/text-diff, the two-cadence
// split) is unchanged.
//
// Two cadences, mirroring the codebase's existing sim-tick-vs-rAF split:
//  - syncSettlementLabelOverlay: full create/update/destroy/text-diff pass,
//    called whenever a new server snapshot arrives (same cadence as
//    world/settlements.ts's applySettlements).
//  - repositionSettlementLabels: cheap position-only pass (no diffing),
//    called every rAF frame so labels track smoothly while orbiting/zooming
//    between snapshots.

import { Vector3, type PerspectiveCamera } from "three";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import type { ViewMode } from "../render3d/viewMode.ts";

// Settlement markers (world/settlements.ts) top out at city tier's
// TIER_HEIGHT (13.5 world units) — float the label comfortably above that
// so it reads as hovering over the marker, not clipping through it.
const SETTLEMENT_LABEL_HEIGHT_WORLD_UNITS = 20;

export interface SettlementLabelOverlay {
  root: HTMLDivElement;
  labels: Map<number, HTMLDivElement>;
  lastText: Map<number, string>;
  /** Cached last-known screen position per label, read by the reposition
   * fast-path without needing to look anything up in the registry. */
  worldPos: Map<number, { x: number; y: number }>;
}

export function createSettlementLabelOverlay(): SettlementLabelOverlay {
  const root = document.createElement("div");
  root.className = "settlement-label-root";
  root.style.display = "none";
  document.body.appendChild(root);

  return { root, labels: new Map(), lastText: new Map(), worldPos: new Map() };
}

function labelText(name: string, tier: string, population: number): string {
  return `${name} · ${tier} (${population})`;
}

/** Full create/update/destroy/text-diff pass. Call whenever a new server
 * snapshot arrives, alongside world/settlements.ts's applySettlements. */
export function syncSettlementLabelOverlay(
  overlay: SettlementLabelOverlay,
  settlements: WireSnapshotV1["settlements"],
  camera: PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
  mode: ViewMode,
): void {
  if (mode !== "map") {
    overlay.root.style.display = "none";
    return;
  }
  overlay.root.style.display = "block";

  const { labels, lastText, worldPos } = overlay;

  const liveIds = new Set(settlements.map((s) => s.id));
  for (const [id, el] of labels) {
    if (!liveIds.has(id)) {
      overlay.root.removeChild(el);
      labels.delete(id);
      lastText.delete(id);
      worldPos.delete(id);
    }
  }

  for (const settlement of settlements) {
    let el = labels.get(settlement.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "settlement-label";
      overlay.root.appendChild(el);
      labels.set(settlement.id, el);
    }

    const text = labelText(settlement.name, settlement.tier, settlement.population);
    if (lastText.get(settlement.id) !== text) {
      el.textContent = text;
      lastText.set(settlement.id, text);
    }

    worldPos.set(settlement.id, { x: settlement.centroidX, y: settlement.centroidY });
  }

  repositionSettlementLabels(overlay, camera, canvasWidth, canvasHeight);
}

// Reused every call to avoid a per-label/per-frame allocation.
const projectionScratch = new Vector3();

/** Cheap position-only pass: writes each label's screen-space transform
 * from its cached world position, with no create/destroy/text-diff work.
 * Call every rAF frame so labels track smoothly during orbit/zoom. World
 * (x, y) maps to three.js (x, z); y is up, so the label floats at
 * SETTLEMENT_LABEL_HEIGHT_WORLD_UNITS above the ground plane. */
export function repositionSettlementLabels(
  overlay: SettlementLabelOverlay,
  camera: PerspectiveCamera,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (overlay.root.style.display === "none") return;

  for (const [id, worldPoint] of overlay.worldPos) {
    const el = overlay.labels.get(id);
    if (!el) continue;

    projectionScratch.set(worldPoint.x, SETTLEMENT_LABEL_HEIGHT_WORLD_UNITS, worldPoint.y);
    projectionScratch.project(camera);

    // Vector3.project can return a point technically behind the camera
    // (NDC values that would otherwise map to a flipped on-screen
    // position) — pixi-viewport's toScreen never had this failure mode,
    // since it's a pure 2D affine transform with no camera-behind concept.
    // Hide the label rather than let it jump to a nonsensical spot; the
    // bird's-eye polar-angle clamp in camera.ts makes this rare in
    // practice, but it's cheap to guard against.
    if (projectionScratch.z > 1) {
      el.style.display = "none";
      continue;
    }
    el.style.display = "";

    const screenX = (projectionScratch.x * 0.5 + 0.5) * canvasWidth;
    const screenY = (-projectionScratch.y * 0.5 + 0.5) * canvasHeight;
    el.style.transform = `translate(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px)`;
  }
}
