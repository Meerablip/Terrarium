// Deterministic PRNG for the sim. Every random draw under /src/sim must go
// through a Rng returned by createRng — never call Math.random() directly —
// so terrain generation and initial placement are reproducible for debugging
// and for the headless test suite.

export interface Rng {
  (): number;
  /** Returns the PRNG's entire internal state as one uint32 — mulberry32
   * has no other state. Used by the server to persist/restore the exact
   * draw sequence across a restart (see src/server/persistence). */
  getState(): number;
  /** Overwrites the PRNG's internal state in place, so subsequent calls
   * continue the sequence exactly as if it had never stopped. */
  restoreRng(state: number): void;
}

/**
 * mulberry32 — small, fast, public-domain 32-bit PRNG. Returns a function
 * that yields floats in [0, 1) on each call, deterministic for a given seed.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng = (function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.getState = () => a >>> 0; // unsigned — `a` is stored signed internally (see `a |= 0` above)
  rng.restoreRng = (state: number) => {
    a = state >>> 0;
  };
  return rng;
}

/** Uniform random float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform random integer in [min, max] (inclusive of both ends). */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

/** Isotropic 2D gaussian falloff, peak 1.0 at the center, given squared distance components. */
export function gaussianFalloff(dx: number, dy: number, sigma: number): number {
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}
