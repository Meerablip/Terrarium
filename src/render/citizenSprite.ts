// A single citizen's animated sprite, plus the heading -> facing-direction
// mapping.
//
// Player.png only carries four discrete facing directions, so a citizen's
// continuous `heading` (radians, atan2(dy,dx) — see
// sim/systems/visionMovementHarvest.ts) is bucketed into the nearest cardinal
// rather than used as a rotation. Rotating a top-down character sprite would
// look wrong regardless; these sheets are drawn to be viewed upright.
//
// World y maps directly to screen y with no flip (both increase downward in
// Pixi), so +y is "down" on screen and the mapping is direct.

import { AnimatedSprite } from "pixi.js";

import { getPlayerWalkFrames, type Direction } from "./assets.ts";

/** Seconds per walk frame at the reference speed. Actual playback rate is
 * scaled by how fast the citizen is really moving (see citizenLayer), so gait
 * matches travel instead of every citizen shuffling at an identical cadence
 * regardless of speed — which matters here because `speed` is an evolved,
 * per-citizen trait with real spread across the population. */
export const WALK_FRAME_SECONDS = 0.12;

export function headingToDirection(heading: number): Direction {
  // Normalise to (-pi, pi], then split into four quadrants centred on each
  // cardinal: right at 0, down at +pi/2, up at -pi/2, left at +-pi.
  const a = Math.atan2(Math.sin(heading), Math.cos(heading));
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return "right";
  if (a > Math.PI / 4 && a <= (3 * Math.PI) / 4) return "down";
  if (a > (3 * Math.PI) / 4 || a <= -(3 * Math.PI) / 4) return "left";
  return "up";
}

export function createCitizenSprite(): AnimatedSprite {
  const sprite = new AnimatedSprite({
    textures: getPlayerWalkFrames("down"),
    autoPlay: false, // driven manually so frame rate can follow real speed
    autoUpdate: false,
  });

  // Anchor at the feet, not the centre: a top-down character's ground
  // position is where it stands, and y-sorting only reads correctly when the
  // sort key matches the contact point with the ground.
  sprite.anchor.set(0.5, 0.9);

  sprite.eventMode = "static";
  sprite.cursor = "pointer";
  return sprite;
}
