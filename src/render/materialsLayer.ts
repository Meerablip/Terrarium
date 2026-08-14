// Material resource nodes — wood renders as a tree, stone as a rock — the
// world objects that were completely missing before this layer existed
// (only terrain and citizens were ever drawn). Stationary once spawned, so
// unlike citizens this needs no interpolation: create on appear, remove on
// depletion. A depleted node is deleted from the store outright (see
// tick.ts's pendingMaterialDepletions), not zeroed, so "no longer in the
// snapshot" is exactly "gone" — no separate empty-state art needed.
//
// Sprites are added directly to the shared entity container (not a private
// one of this layer's own) so they y-sort against citizens and homes
// correctly — see main.ts.

import { Sprite, type Container } from "pixi.js";

import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { getOakTreeTexture, getRockTexture } from "./assets.ts";

const KIND_STONE = 1;

/** Native rock art is a single 16px icon — too small to hold its own next to
 * a full-height tree, so it's drawn at twice the tile size. */
const ROCK_SIZE = 32;

export interface MaterialsLayer {
  parent: Container;
  entries: Map<number, Sprite>;
}

export function createMaterialsLayer(parent: Container): MaterialsLayer {
  return { parent, entries: new Map() };
}

function createSprite(kind: number): Sprite {
  if (kind === KIND_STONE) {
    const sprite = new Sprite(getRockTexture());
    sprite.anchor.set(0.5, 0.85);
    sprite.width = ROCK_SIZE;
    sprite.height = ROCK_SIZE;
    return sprite;
  }
  const sprite = new Sprite(getOakTreeTexture());
  sprite.anchor.set(0.5, 0.95);
  return sprite;
}

export function syncMaterialsLayer(layer: MaterialsLayer, materials: WireSnapshotV1["materials"]): void {
  const { parent, entries } = layer;

  const live = new Set<number>();
  for (const m of materials) live.add(m.id);
  for (const [id, sprite] of entries) {
    if (!live.has(id)) {
      parent.removeChild(sprite);
      sprite.destroy();
      entries.delete(id);
    }
  }

  for (const m of materials) {
    if (entries.has(m.id)) continue; // stationary — nothing to update once placed
    const sprite = createSprite(m.kind);
    sprite.x = m.x;
    sprite.y = m.y;
    sprite.zIndex = m.y;
    parent.addChild(sprite);
    entries.set(m.id, sprite);
  }
}
