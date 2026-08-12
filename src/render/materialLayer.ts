// Container of per-material-node dot sprites, synced from the latest
// server-broadcast wire-format material array — the same
// create/update/destroy-by-id pattern as citizenLayer.ts. Ground view only
// (main.ts toggles this layer's container.visible in map view).

import { Container, Graphics } from "pixi.js";
import type { EntityId } from "../types.ts";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { MATERIAL_KIND_COLORS } from "./colors.ts";

export interface MaterialLayer {
  container: Container;
  sprites: Map<EntityId, Graphics>;
}

const DOT_RADIUS = 3;

function createDot(kind: number): Graphics {
  const g = new Graphics();
  const color = MATERIAL_KIND_COLORS[kind] ?? MATERIAL_KIND_COLORS[0];
  g.circle(0, 0, DOT_RADIUS).fill(color);
  return g;
}

export function createMaterialLayer(): MaterialLayer {
  return { container: new Container(), sprites: new Map() };
}

/** Syncs dots to match the latest wire-format material array: creates dots
 * for newly-seen nodes, destroys dots for nodes depleted-and-removed since
 * the last sync, and repositions the rest. Call once per incoming server
 * snapshot. */
export function syncMaterialLayer(layer: MaterialLayer, materials: WireSnapshotV1["materials"]): void {
  const { container, sprites } = layer;

  const liveIds = new Set(materials.map((m) => m.id));
  for (const [id, sprite] of sprites) {
    if (!liveIds.has(id)) {
      container.removeChild(sprite);
      sprite.destroy();
      sprites.delete(id);
    }
  }

  for (const m of materials) {
    let sprite = sprites.get(m.id);

    if (!sprite) {
      sprite = createDot(m.kind);
      container.addChild(sprite);
      sprites.set(m.id, sprite);
    }

    sprite.position.set(m.x, m.y);
  }
}
