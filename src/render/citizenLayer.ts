// Container of per-citizen triangle sprites, synced from the latest
// server-broadcast wire-format citizen array once per incoming WebSocket
// message. Read-only against the data it's given — this file only
// creates/positions/destroys Pixi display objects.
//
// Uses a plain Container rather than ParticleContainer: at the MVP's target
// scale (200-400 entities) a normal Container is comfortably within Pixi 8's
// batching budget, and per-sprite `eventMode`/click listeners (needed for
// click-to-select) aren't supported per-particle by ParticleContainer.

import type { FederatedPointerEvent, Graphics } from "pixi.js";
import { Container } from "pixi.js";
import type { EntityId } from "../types.ts";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { createTriangle } from "./citizenSprite.ts";

export interface CitizenLayer {
  container: Container;
  sprites: Map<EntityId, Graphics>;
}

export function createCitizenLayer(): CitizenLayer {
  const container = new Container();
  const sprites = new Map<EntityId, Graphics>();
  return { container, sprites };
}

/**
 * Syncs the Pixi display list to match the latest wire-format citizen
 * array: creates sprites for newly-seen ids, destroys sprites for ids no
 * longer present (died since last sync), and updates position/rotation for
 * all live citizens. Call once per incoming server snapshot.
 */
export function syncCitizenLayer(
  layer: CitizenLayer,
  citizens: WireSnapshotV1["citizens"],
  onCitizenClick: (id: EntityId, event: FederatedPointerEvent) => void,
): void {
  const { container, sprites } = layer;

  const liveIds = new Set(citizens.map((c) => c.id));
  for (const [id, sprite] of sprites) {
    if (!liveIds.has(id)) {
      container.removeChild(sprite);
      sprite.destroy();
      sprites.delete(id);
    }
  }

  for (const c of citizens) {
    let sprite = sprites.get(c.id);

    if (!sprite) {
      sprite = createTriangle();
      const id = c.id;
      sprite.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        onCitizenClick(id, event);
      });
      container.addChild(sprite);
      sprites.set(c.id, sprite);
    }

    sprite.position.set(c.x, c.y);
    sprite.rotation = c.heading;
  }
}
