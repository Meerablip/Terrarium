// Pure steering math for citizens.ts's capped-speed-seek movement smoothing
// (Phase 2). Extracted into its own module — no three.js/DOM/WebGL
// dependency — so it's unit-testable the same way src/sim/*'s pure logic
// is (see test/render3d/steering.test.ts), per the implementation plan's
// guidance to cheaply cover the parts of a phase that aren't inherently
// three.js-rendering-dependent.
//
// shortestAngle is ported verbatim from kuku's world/agents.ts. seekStep is
// a generalization of the position-integration block in agents.ts's
// update() (the `distance <= step ? snap : move-proportionally` shape),
// factored out as a standalone function instead of being inlined per-entry.

export interface SeekResult {
  x: number;
  y: number;
  /** True if this step reached (or was already at) the target. */
  arrived: boolean;
  /** Distance actually covered this step, world units. */
  distanceMoved: number;
}

/** Moves (fromX, fromY) toward (targetX, targetY) by at most `speed *
 * deltaSeconds` world units. Snaps exactly onto the target rather than
 * overshooting once within one step's distance. */
export function seekStep(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  speed: number,
  deltaSeconds: number,
): SeekResult {
  const dx = targetX - fromX;
  const dy = targetY - fromY;
  const distance = Math.hypot(dx, dy);
  const step = speed * deltaSeconds;

  if (distance <= step) {
    return { x: targetX, y: targetY, arrived: true, distanceMoved: distance };
  }

  return {
    x: fromX + (dx / distance) * step,
    y: fromY + (dy / distance) * step,
    arrived: false,
    distanceMoved: step,
  };
}

/** Shortest signed angular delta from `from` to `to`, in (-PI, PI]. Ported
 * verbatim from kuku's world/agents.ts — avoids the radian -PI/PI
 * wraparound bug a naive lerp would hit (e.g. turning from 3.1 to -3.1
 * radians should turn a short way through PI, not the long way around
 * through 0). */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Turns `heading` toward `targetHeading` by at most a `turnSpeed *
 * deltaSeconds`-capped fraction of the shortest-arc delta per second —
 * same shape as kuku's agents.ts per-frame heading update. */
export function turnStep(
  heading: number,
  targetHeading: number,
  turnSpeed: number,
  deltaSeconds: number,
): number {
  return heading + shortestAngle(heading, targetHeading) * Math.min(1, deltaSeconds * turnSpeed);
}
