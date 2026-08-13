// Day/night cycle driver — tick-driven, not wall-clock, per the
// implementation plan's rationale: a real-time clock would desync across
// clients/reconnects (a client that reconnects after being closed for an
// hour would show a different time of day than one that's stayed open),
// while the sim's own `tick` field (already in WireSnapshotV1, broadcast
// every snapshot) is deterministic and shared by every client watching the
// same world — consistent with the sim's whole determinism ethos
// (src/sim/rng.ts, WORLD_SEED).
//
// This constant deliberately does NOT live in src/sim/constants.ts, even
// though every other tick-interval constant does (WEATHER_INTERVAL_TICKS
// etc.) — it's a pure render-side interpretation of a field the wire format
// already exposes, not a new sim rule, and src/sim/ is out of scope for
// this plan (no sim changes without separate sign-off).

import { SERVER_TICK_HZ } from "../server/constants.ts";
import type { WorldMood } from "./world/palette.ts";

// Sim ticks at 20Hz (SERVER_TICK_HZ) continuously — a 5-minute full
// day/night cycle (300s * 20 ticks/s), long enough to feel like a real
// rhythm, short enough to actually watch happen in one sitting.
export const DAY_NIGHT_CYCLE_TICKS = 300 * SERVER_TICK_HZ; // 6000

// Fraction of the cycle spent transitioning at each day<->night boundary
// (dawn and dusk), rather than a hard cut. 0.08 of a 6000-tick cycle is a
// 480-tick (24s) fade each way — long enough to read as a gradual sky
// change, short enough not to dominate the cycle.
const TRANSITION_FRACTION = 0.08;

/** Which half of the cycle a tick falls in — a hard classification, mostly
 * useful for behavior gates (e.g. a future "citizens go home at night" rule)
 * that need a boolean, not a blend. Visuals should use
 * nightBlendFactorForTick instead, which transitions smoothly instead of
 * snapping at this boundary. */
export function moodForTick(tick: number): WorldMood {
  const phase = ((tick % DAY_NIGHT_CYCLE_TICKS) + DAY_NIGHT_CYCLE_TICKS) % DAY_NIGHT_CYCLE_TICKS;
  return phase < DAY_NIGHT_CYCLE_TICKS / 2 ? "day" : "night";
}

/** Smooth 0..1 blend factor: 0 = fully day, 1 = fully night, ramping across
 * TRANSITION_FRACTION of the cycle at both the day->night (dusk) and
 * night->day (dawn) boundaries instead of snapping. Callers lerp every
 * WorldPalette field between GHIBLI_DAY and GHIBLI_NIGHT by this factor
 * (see world/paletteBlend.ts). */
export function nightBlendFactorForTick(tick: number): number {
  const cycle = DAY_NIGHT_CYCLE_TICKS;
  const half = cycle / 2;
  const transition = cycle * TRANSITION_FRACTION;
  const phase = ((tick % cycle) + cycle) % cycle; // 0..cycle, always positive

  if (phase < half) {
    // Day half: 0 at sunrise-complete, ramping to 1 across dusk
    // (the transition window ending exactly at `half`).
    const duskStart = half - transition;
    if (phase < duskStart) return 0;
    return (phase - duskStart) / transition;
  }

  // Night half: 1 through most of the night, ramping back to 0 across dawn
  // (the transition window ending exactly at `cycle`, i.e. wrapping to 0).
  const dawnStart = cycle - transition;
  if (phase < dawnStart) return 1;
  return 1 - (phase - dawnStart) / transition;
}
