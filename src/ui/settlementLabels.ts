// Map-view-only DOM overlay: per-settlement, world-position-tracked name
// labels. Unlike statPanel.ts's single fixed-corner card, this is a pool of
// absolutely-positioned divs, one per registered settlement, repositioned
// every frame via the viewport's own coordinate transform. Read-only against
// sim/registry state — only ever reads registry.settlements (Map iteration)
// and calls viewport.toScreen (pixi-viewport's pure coordinate transform);
// writes exclusively to its own DOM elements.
//
// Two cadences, mirroring the codebase's existing sim-tick-vs-rAF split:
//  - syncSettlementLabelOverlay: full create/update/destroy/text-diff pass,
//    called whenever a new server snapshot arrives (same cadence as
//    syncSettlementLayer).
//  - repositionSettlementLabels: cheap position-only pass (no diffing),
//    called every rAF frame so labels track smoothly while panning/zooming
//    between snapshots.

import type { Viewport } from "pixi-viewport";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import type { ViewMode } from "../render/viewMode.ts";

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
 * snapshot arrives, alongside syncSettlementLayer. */
export function syncSettlementLabelOverlay(
  overlay: SettlementLabelOverlay,
  settlements: WireSnapshotV1["settlements"],
  viewport: Viewport,
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

  repositionSettlementLabels(overlay, viewport);
}

/** Cheap position-only pass: writes each label's screen-space transform
 * from its cached world position, with no create/destroy/text-diff work.
 * Call every rAF frame so labels track smoothly during pan/zoom. */
export function repositionSettlementLabels(overlay: SettlementLabelOverlay, viewport: Viewport): void {
  if (overlay.root.style.display === "none") return;

  for (const [id, worldPoint] of overlay.worldPos) {
    const el = overlay.labels.get(id);
    if (!el) continue;
    const screen = viewport.toScreen(worldPoint.x, worldPoint.y);
    el.style.transform = `translate(${screen.x.toFixed(1)}px, ${screen.y.toFixed(1)}px)`;
  }
}
