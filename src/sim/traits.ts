// The genome and its costs — the single source of truth for what is
// heritable, how it mutates, and what it costs to carry.
//
// Genes (heritable, mutable): visionRadius, speed.
// Derived (computed from genes, never inherited independently): metabolismRate.
//
// That split is the whole design. Before this module existed, all three were
// stored as per-citizen columns and copied verbatim to offspring with no
// mutation, so every citizen in the world had byte-identical traits and
// variance was exactly zero — selection had nothing to act on. Adding
// mutation alone would not have been enough either: with metabolism as an
// independent gene, the optimum is simply "max vision, max speed, zero
// upkeep," and the population collapses into that corner and stops being
// interesting. Deriving upkeep from the genes is what makes the fitness
// landscape have tradeoffs instead of a single unbounded maximum.

import {
  METABOLISM_BASE,
  METABOLISM_SPEED_COST,
  METABOLISM_VISION_COST,
  MOVE_SPEED_MAX,
  MOVE_SPEED_MIN,
  MUTATION_SIGMA_FRACTION,
  VISION_RADIUS_MAX,
  VISION_RADIUS_MIN,
} from "./constants.ts";
import { randGaussian, type Rng } from "./rng.ts";

/** The heritable genome. Deliberately NOT including metabolismRate — see the
 * header comment for why that would collapse the trait space. */
export interface Genome {
  visionRadius: number;
  speed: number;
}

/** A genome plus everything derived from it, in the shape the citizen store
 * and SpawnRequest both want. */
export interface Traits extends Genome {
  metabolismRate: number;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Upkeep cost of carrying a given genome, in resource per tick.
 *
 * Speed is squared and vision is linear on purpose: both should cost more as
 * they grow, but sprinting should get expensive *faster* than seeing far, so
 * the two genes occupy genuinely different regions of the tradeoff curve
 * rather than being interchangeable. Without the asymmetry there'd be one
 * efficient frontier and much less interesting differentiation.
 */
export function deriveMetabolismRate(genome: Genome): number {
  return (
    METABOLISM_BASE +
    METABOLISM_SPEED_COST * genome.speed * genome.speed +
    METABOLISM_VISION_COST * genome.visionRadius
  );
}

/** Builds the full Traits record (genome + derived upkeep) from a genome. */
export function traitsFromGenome(genome: Genome): Traits {
  return {
    visionRadius: genome.visionRadius,
    speed: genome.speed,
    metabolismRate: deriveMetabolismRate(genome),
  };
}

/**
 * Produces a child's traits from a parent's, applying proportional gaussian
 * mutation to each gene and recomputing the derived upkeep.
 *
 * Mutation is proportional (sigma = MUTATION_SIGMA_FRACTION * parent value)
 * rather than absolute so both genes drift at comparable *relative* rates
 * despite living on very different scales (vision ~64, speed ~6). Draws come
 * from the passed-in seeded Rng, so a given seed still reproduces a run
 * exactly — determinism is a property the whole sim depends on and mutation
 * must not be the thing that breaks it.
 */
export function mutateTraits(parent: Genome, rng: Rng): Traits {
  const visionRadius = clamp(
    randGaussian(rng, parent.visionRadius, Math.abs(parent.visionRadius) * MUTATION_SIGMA_FRACTION),
    VISION_RADIUS_MIN,
    VISION_RADIUS_MAX,
  );
  const speed = clamp(
    randGaussian(rng, parent.speed, Math.abs(parent.speed) * MUTATION_SIGMA_FRACTION),
    MOVE_SPEED_MIN,
    MOVE_SPEED_MAX,
  );

  return traitsFromGenome({ visionRadius, speed });
}
