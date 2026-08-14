// Citizen sprites, synced from wire snapshots and smoothly interpolated
// between them.
//
// THE POINT OF THIS FILE: snapshots arrive at BROADCAST_HZ (10/s) while the
// sim ticks at SERVER_TICK_HZ (20/s), so each snapshot moves a citizen by up
// to two full ticks of travel at once — roughly 9-10 world units at typical
// evolved speeds. The previous renderer assigned that straight to the sprite
// (`sprite.position.set(c.x, c.y)`), which is exactly why agents appeared to
// skip across the ground instead of walking: they teleported ten times a
// second and never occupied the space between.
//
// The fix is snapshot interpolation. Each citizen keeps the position it was
// last drawn at and the position the newest snapshot puts it at, then slides
// between them across one broadcast interval. The sprite is therefore always
// ~100ms behind the simulation — imperceptible, and the standard trade every
// networked game makes for smooth motion.
//
// Two details that matter:
//  - Interpolation is driven by real frame delta, not a fixed 1/60, so
//    motion stays correct when the frame rate isn't exactly 60.
//  - A citizen that moves an implausible distance in one snapshot (a fresh
//    spawn, or a reconnect after the tab was backgrounded) SNAPS instead of
//    gliding, so it doesn't sail across the whole map in a straight line.

import type { AnimatedSprite, Container, FederatedPointerEvent } from "pixi.js";

import type { EntityId } from "../types.ts";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { BROADCAST_HZ } from "../server/constants.ts";
import { getPlayerWalkFrames, type Direction } from "./assets.ts";
import { createCitizenSprite, headingToDirection, WALK_FRAME_SECONDS } from "./citizenSprite.ts";

const SNAPSHOT_INTERVAL_SECONDS = 1 / BROADCAST_HZ;

/** Beyond this single-snapshot jump (world units) we assume a discontinuity
 * rather than travel, and snap. Comfortably above the ~10 units a fast
 * citizen covers per broadcast, well below a cross-map teleport. */
const SNAP_DISTANCE = 64;

/** Below this speed (world units/sec) a citizen reads as standing still and
 * shows a single idle frame rather than cycling its walk. */
const IDLE_SPEED = 1.5;

interface CitizenEntry {
  sprite: AnimatedSprite;
  /** Where the sprite is being drawn right now (interpolated). */
  drawX: number;
  drawY: number;
  /** Where it was when the latest snapshot landed, and where that snapshot
   * says it should end up. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Seconds since the latest snapshot, for the 0..1 interpolation factor. */
  elapsed: number;
  direction: Direction;
  frameTimer: number;
  frameIndex: number;
  /** Most recent interpolated speed, world units/sec — drives walk vs idle
   * and the animation rate. */
  visualSpeed: number;
}

export interface CitizenLayer {
  /** Shared entity container sprites are added to directly (not a private
   * container of this layer's own) so citizens y-sort against homes and
   * materials rather than being stuck in their own flat stratum. */
  parent: Container;
  entries: Map<EntityId, CitizenEntry>;
}

export function createCitizenLayer(parent: Container): CitizenLayer {
  return { parent, entries: new Map() };
}

/** Applies a new snapshot: reconciles the entity set and re-aims every
 * citizen's interpolation. Does NOT move sprites — that's updateCitizenLayer,
 * on the render loop. */
export function syncCitizenLayer(
  layer: CitizenLayer,
  citizens: WireSnapshotV1["citizens"],
  onCitizenClick: (id: EntityId) => void,
): void {
  const { parent, entries } = layer;

  const live = new Set<EntityId>();
  for (const c of citizens) live.add(c.id);
  for (const [id, entry] of entries) {
    if (!live.has(id)) {
      parent.removeChild(entry.sprite);
      entry.sprite.destroy();
      entries.delete(id);
    }
  }

  for (const c of citizens) {
    let entry = entries.get(c.id);

    if (!entry) {
      const sprite = createCitizenSprite();
      const id = c.id;
      sprite.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        onCitizenClick(id);
      });
      parent.addChild(sprite);
      entry = {
        sprite,
        drawX: c.x,
        drawY: c.y,
        fromX: c.x,
        fromY: c.y,
        toX: c.x,
        toY: c.y,
        elapsed: 0,
        direction: headingToDirection(c.heading),
        frameTimer: 0,
        frameIndex: 0,
        visualSpeed: 0,
      };
      entry.sprite.textures = getPlayerWalkFrames(entry.direction);
      entries.set(c.id, entry);
      continue;
    }

    const jump = Math.hypot(c.x - entry.drawX, c.y - entry.drawY);
    if (jump > SNAP_DISTANCE) {
      entry.drawX = c.x;
      entry.drawY = c.y;
    }

    // Re-aim: interpolate from wherever the sprite actually is (not from the
    // previous snapshot's position) so a dropped or late frame doesn't cause
    // a visible jerk backwards.
    entry.fromX = entry.drawX;
    entry.fromY = entry.drawY;
    entry.toX = c.x;
    entry.toY = c.y;
    entry.elapsed = 0;

    // Face the direction of actual travel while moving. A stationary citizen
    // keeps its last facing rather than snapping around on heading noise.
    if (Math.hypot(c.x - entry.fromX, c.y - entry.fromY) > 0.01) {
      const direction = headingToDirection(c.heading);
      if (direction !== entry.direction) {
        entry.direction = direction;
        entry.sprite.textures = getPlayerWalkFrames(direction);
        entry.frameIndex = entry.frameIndex % getPlayerWalkFrames(direction).length;
      }
    }
  }
}

/** Advances interpolation and animation. Call every rendered frame with the
 * real elapsed time. */
export function updateCitizenLayer(layer: CitizenLayer, deltaSeconds: number): void {
  for (const entry of layer.entries.values()) {
    entry.elapsed += deltaSeconds;

    // Clamped at 1: if the next snapshot is late, hold at the target rather
    // than overshooting past it.
    const t = Math.min(1, entry.elapsed / SNAPSHOT_INTERVAL_SECONDS);
    const nextX = entry.fromX + (entry.toX - entry.fromX) * t;
    const nextY = entry.fromY + (entry.toY - entry.fromY) * t;

    const moved = Math.hypot(nextX - entry.drawX, nextY - entry.drawY);
    entry.visualSpeed = deltaSeconds > 0 ? moved / deltaSeconds : 0;

    entry.drawX = nextX;
    entry.drawY = nextY;
    entry.sprite.x = nextX;
    entry.sprite.y = nextY;
    // Depth: sort by ground position so a citizen below an object overlaps
    // it and one above is overlapped by it.
    entry.sprite.zIndex = nextY;

    const frames = entry.sprite.textures;
    if (entry.visualSpeed > IDLE_SPEED) {
      // Faster citizens step faster. Scaled against a nominal reference speed
      // so the gait reads as belonging to the movement.
      const rate = Math.min(3, entry.visualSpeed / 30);
      entry.frameTimer += deltaSeconds * rate;
      while (entry.frameTimer >= WALK_FRAME_SECONDS) {
        entry.frameTimer -= WALK_FRAME_SECONDS;
        entry.frameIndex = (entry.frameIndex + 1) % frames.length;
      }
    } else {
      entry.frameIndex = 0; // idle/neutral pose
      entry.frameTimer = 0;
    }
    entry.sprite.currentFrame = entry.frameIndex;
  }
}
