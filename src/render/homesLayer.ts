// Home records rendered as house sprites. A Home exists (and starts
// clearing ground — see terrainLayer.ts) the moment it's founded, well
// before it's actually a house, so the sprite scales up from a small
// footprint as buildProgress advances rather than popping in at full size
// only on completion.
//
// Sprites are added directly to the shared entity container (not a private
// one of this layer's own) so they y-sort against citizens and trees
// correctly — see main.ts.

import { Sprite, type Container } from "pixi.js";

import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { getHouseTexture } from "./assets.ts";

/** Scale at buildProgress=0 — a home is visible (and its yard already
 * clearing) from the very first deposit, not just once complete. */
const MIN_SCALE = 0.35;

export interface HomesLayer {
  parent: Container;
  entries: Map<number, Sprite>;
}

export function createHomesLayer(parent: Container): HomesLayer {
  return { parent, entries: new Map() };
}

export function syncHomesLayer(layer: HomesLayer, homes: WireSnapshotV1["homes"]): void {
  const { parent, entries } = layer;

  const live = new Set<number>();
  for (const h of homes) live.add(h.id);
  for (const [id, sprite] of entries) {
    if (!live.has(id)) {
      parent.removeChild(sprite);
      sprite.destroy();
      entries.delete(id);
    }
  }

  for (const h of homes) {
    let sprite = entries.get(h.id);
    if (!sprite) {
      sprite = new Sprite(getHouseTexture());
      sprite.anchor.set(0.5, 1);
      parent.addChild(sprite);
      entries.set(h.id, sprite);
    }
    sprite.x = h.x;
    sprite.y = h.y;
    sprite.zIndex = h.y;
    sprite.scale.set(MIN_SCALE + (1 - MIN_SCALE) * h.buildProgress);
    sprite.alpha = h.complete ? 1 : 0.85;
  }
}
