// Population-level trait telemetry. Pure read-only aggregation over the
// citizen store — computes nothing the simulation itself consumes.
//
// This exists because "is it evolving?" is otherwise unanswerable. A trait
// mean that moves is the difference between adaptation and drift, and the
// only way to see it is to sample the distribution over time. Variance
// matters just as much as the mean: a population whose variance has
// collapsed to ~0 has stopped evolving regardless of where its mean landed,
// which is the failure mode to watch for when tuning mutation and selection
// strength against each other.

import type { CitizenStore } from "./ecs/store.ts";
import { deriveMetabolismRate } from "./traits.ts";

export interface TraitSummary {
  mean: number;
  /** Population standard deviation (not sample) — this is the whole
   * population, not a sample drawn from a larger one. */
  stdDev: number;
  min: number;
  max: number;
}

export interface PopulationStats {
  tick: number;
  population: number;
  visionRadius: TraitSummary;
  speed: TraitSummary;
  metabolismRate: TraitSummary;
  age: TraitSummary;
  generation: TraitSummary;
  /** Theoretical upkeep of a citizen sitting exactly at the population's mean
   * genome. Compared against metabolismRate.mean it reveals whether the cost
   * function is convex over the realized distribution — they diverge when the
   * population spreads across the tradeoff curve rather than clustering. */
  meanGenomeMetabolism: number;
}

function summarize(values: ArrayLike<number>, count: number): TraitSummary {
  if (count === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / count;

  let sumSqDiff = 0;
  for (let i = 0; i < count; i++) {
    const d = values[i] - mean;
    sumSqDiff += d * d;
  }

  return { mean, stdDev: Math.sqrt(sumSqDiff / count), min, max };
}

export function computePopulationStats(citizens: CitizenStore, tick: number): PopulationStats {
  const count = citizens.count;
  const visionRadius = summarize(citizens.visionRadius, count);
  const speed = summarize(citizens.speed, count);

  return {
    tick,
    population: count,
    visionRadius,
    speed,
    metabolismRate: summarize(citizens.metabolismRate, count),
    age: summarize(citizens.age, count),
    generation: summarize(citizens.generation, count),
    meanGenomeMetabolism: deriveMetabolismRate({
      visionRadius: visionRadius.mean,
      speed: speed.mean,
    }),
  };
}

/** One-line, column-aligned digest for headless tuning runs. */
export function formatPopulationStats(stats: PopulationStats): string {
  const f = (n: number, w: number, p = 2) => n.toFixed(p).padStart(w);
  return (
    `t=${String(stats.tick).padStart(7)} ` +
    `pop=${String(stats.population).padStart(5)} ` +
    `gen=${f(stats.generation.mean, 6, 1)} ` +
    `vision=${f(stats.visionRadius.mean, 6, 1)}±${f(stats.visionRadius.stdDev, 5, 1)} ` +
    `speed=${f(stats.speed.mean, 5, 2)}±${f(stats.speed.stdDev, 4, 2)} ` +
    `upkeep=${f(stats.metabolismRate.mean, 5, 3)} ` +
    `age=${f(stats.age.mean, 7, 0)}`
  );
}
