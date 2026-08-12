// Container of per-home sprites, synced from the latest server-broadcast
// wire-format home array. Same conceptual create/update/destroy-by-id
// pattern as citizenLayer.ts.
//
// Sprite differs by `complete`: a small dim marker under construction, a
// full tier-appropriate structure icon once complete — a state swap, not an
// animated build-up, since the spec only requires rendering once complete.

import { Container, Graphics } from "pixi.js";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { HOME_COMPLETE_COLOR, HOME_UNDER_CONSTRUCTION_COLOR } from "./colors.ts";

export interface HomeLayer {
  container: Container;
  sprites: Map<number, Graphics>;
  /** Tracks which sprites are currently drawn in the "complete" state, so
   * syncHomeLayer only redraws a sprite's geometry when that flag actually
   * flips rather than every sync. */
  completeState: Map<number, boolean>;
}

const UNDER_CONSTRUCTION_SIZE = 4;
const COMPLETE_SIZE = 7;

function drawHomeSprite(g: Graphics, complete: boolean): void {
  g.clear();
  if (complete) {
    const s = COMPLETE_SIZE;
    g.rect(-s / 2, -s / 2, s, s).fill(HOME_COMPLETE_COLOR);
  } else {
    const s = UNDER_CONSTRUCTION_SIZE;
    g.circle(0, 0, s / 2).fill(HOME_UNDER_CONSTRUCTION_COLOR);
  }
}

export function createHomeLayer(): HomeLayer {
  return { container: new Container(), sprites: new Map(), completeState: new Map() };
}

export function syncHomeLayer(layer: HomeLayer, homes: WireSnapshotV1["homes"]): void {
  const { container, sprites, completeState } = layer;

  const liveIds = new Set(homes.map((h) => h.id));
  for (const [id, sprite] of sprites) {
    if (!liveIds.has(id)) {
      container.removeChild(sprite);
      sprite.destroy();
      sprites.delete(id);
      completeState.delete(id);
    }
  }

  for (const home of homes) {
    let sprite = sprites.get(home.id);

    if (!sprite) {
      sprite = new Graphics();
      drawHomeSprite(sprite, home.complete);
      container.addChild(sprite);
      sprites.set(home.id, sprite);
      completeState.set(home.id, home.complete);
    } else if (completeState.get(home.id) !== home.complete) {
      drawHomeSprite(sprite, home.complete);
      completeState.set(home.id, home.complete);
    }

    sprite.position.set(home.x, home.y);
  }
}
