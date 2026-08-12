// Density/tier classifier + settlement registry (Phase 2, rule 8). This is
// genuinely new groundwork this phase — no settlement/tier/density concept
// existed in the MVP to "extend." Runs as a pure post-tick read pass: it
// only reads citizens.x/y (already stable — this tick's deaths/spawns have
// already been applied by the time it runs) and writes only to its own
// independent SettlementRegistry and scratch buffers, so it needs none of
// tick.ts's deferred-mutation machinery — it never calls
// killAtSlot/spawnCitizen/spawnMaterial.
//
// Clustering approach: uniform grid-cell bucketing on the existing
// TerrainGrid cells (reusing worldToCell/cellIndex), then a flood-fill over
// *occupied* cells only (bounded by live population, not the full grid) to
// group them into clusters. Simplest approach that works cleanly at
// 200-400 citizens with zero new spatial index — rejected alternatives were
// a separate spatial hash (new structure to keep in sync) and k-NN/k-d tree
// (unneeded complexity/cost) since the terrain grid's cells are already a
// good bucketing resolution.

import {
  SETTLEMENT_DISSOLVE_GRACE_TICKS,
  SETTLEMENT_FOUND_THRESHOLD_TICKS,
  SETTLEMENT_MATCH_RADIUS,
  TIER_CITY_MIN,
  TIER_HUT_MIN,
  TIER_MATERIAL_BONUS_THRESHOLD,
  TIER_VILLAGE_MIN,
} from "../constants.ts";
import type { CitizenStore } from "../ecs/store.ts";
import type { HomeRegistry } from "../homes.ts";
import { randInt, type Rng } from "../rng.ts";
import { cellIndex, cellToWorldCenter, worldToCell, type TerrainGrid } from "../terrain.ts";

export type Tier = "hut" | "village" | "city";

const TIER_ORDER: Tier[] = ["hut", "village", "city"];

function tierFromPopulation(pop: number): Tier | undefined {
  if (pop >= TIER_CITY_MIN) return "city";
  if (pop >= TIER_VILLAGE_MIN) return "village";
  if (pop >= TIER_HUT_MIN) return "hut";
  return undefined;
}

function bumpTier(tier: Tier): Tier {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
}

export interface SettlementRecord {
  id: number;
  name: string;
  foundingTick: number;
  centroidX: number;
  centroidY: number;
  tier: Tier;
  population: number;
  memberCellIndices: Set<number>;
  /** null = healthy; counting down = at risk of dissolve once it hits 0. */
  graceTicksRemaining: number | null;
}

interface PendingCluster {
  id: number;
  centroidX: number;
  centroidY: number;
  sustainedTicks: number;
}

export interface SettlementRegistry {
  settlements: Map<number, SettlementRecord>;
  nextId: number;
  /** Transient, not part of any settlement yet: clusters at/above
   * TIER_HUT_MIN population sustaining toward SETTLEMENT_FOUND_THRESHOLD_TICKS.
   * Matched tick-to-tick by centroid proximity (SETTLEMENT_MATCH_RADIUS),
   * the same way registered settlements are matched — NOT by exact cell
   * index, since a cluster's lowest-member-cell-index shifts every time a
   * citizen wanders in or out of that one cell even though the cluster
   * itself is spatially stable, which made sustain-tracking spuriously
   * reset almost every tick in practice. */
  pendingClusters: Map<number, PendingCluster>;
  nextPendingId: number;
}

export function createSettlementRegistry(): SettlementRegistry {
  return { settlements: new Map(), nextId: 1, pendingClusters: new Map(), nextPendingId: 1 };
}

interface Cluster {
  population: number;
  centroidX: number;
  centroidY: number;
  memberCellIndices: Set<number>;
  minCellIndex: number;
}

/** Buckets live citizens into terrain cells, then flood-fills 4-connected
 * adjacency over occupied cells into clusters. Bounded by live population
 * (<=400), not the 10,000-cell grid. */
function computeClusters(citizens: CitizenStore, terrain: TerrainGrid, cellPopScratch: Uint16Array): Cluster[] {
  cellPopScratch.fill(0);
  for (let slot = 0; slot < citizens.count; slot++) {
    const { cx, cy } = worldToCell(terrain, citizens.x[slot], citizens.y[slot]);
    cellPopScratch[cellIndex(terrain, cx, cy)]++;
  }

  const visited = new Set<number>();
  const clusters: Cluster[] = [];

  for (let cy = 0; cy < terrain.rows; cy++) {
    for (let cx = 0; cx < terrain.cols; cx++) {
      const startIdx = cellIndex(terrain, cx, cy);
      if (cellPopScratch[startIdx] === 0 || visited.has(startIdx)) continue;

      // Flood-fill this occupied cell's connected component.
      const stack = [{ cx, cy }];
      visited.add(startIdx);
      let population = 0;
      let weightedX = 0;
      let weightedY = 0;
      const memberCellIndices = new Set<number>();
      let minCellIndex = startIdx;

      while (stack.length > 0) {
        const cell = stack.pop()!;
        const idx = cellIndex(terrain, cell.cx, cell.cy);
        const pop = cellPopScratch[idx];
        population += pop;
        memberCellIndices.add(idx);
        if (idx < minCellIndex) minCellIndex = idx;
        const center = cellToWorldCenter(terrain, cell.cx, cell.cy);
        weightedX += center.x * pop;
        weightedY += center.y * pop;

        const neighbors = [
          { cx: cell.cx - 1, cy: cell.cy },
          { cx: cell.cx + 1, cy: cell.cy },
          { cx: cell.cx, cy: cell.cy - 1 },
          { cx: cell.cx, cy: cell.cy + 1 },
        ];
        for (const n of neighbors) {
          if (n.cx < 0 || n.cx >= terrain.cols || n.cy < 0 || n.cy >= terrain.rows) continue;
          const nIdx = cellIndex(terrain, n.cx, n.cy);
          if (cellPopScratch[nIdx] === 0 || visited.has(nIdx)) continue;
          visited.add(nIdx);
          stack.push(n);
        }
      }

      clusters.push({
        population,
        centroidX: weightedX / population,
        centroidY: weightedY / population,
        memberCellIndices,
        minCellIndex,
      });
    }
  }

  return clusters;
}

/** Sum of buildProgress across complete Homes whose position falls within
 * the cluster's member cells — an additive tier bonus, never a downgrade,
 * per the confirmed scope decision to treat material investment as
 * extending density-based scoring rather than replacing it. */
function materialBonusFor(cluster: Cluster, homes: HomeRegistry, terrain: TerrainGrid): number {
  let sum = 0;
  for (const home of homes.homes.values()) {
    if (!home.complete) continue;
    const { cx, cy } = worldToCell(terrain, home.x, home.y);
    if (cluster.memberCellIndices.has(cellIndex(terrain, cx, cy))) {
      sum += home.buildProgress;
    }
  }
  return sum;
}

const NAME_PREFIXES = ["Oak", "Elm", "Stone", "Brook", "Fen", "Vale", "Alder", "Ash", "Birch", "Reed"];
const NAME_SUFFIXES = ["ford", "hollow", "ridge", "haven", "mere", "wick", "stead", "cross", "hurst", "dell"];

function generateSettlementName(rng: Rng): string {
  const prefix = NAME_PREFIXES[randInt(rng, 0, NAME_PREFIXES.length - 1)];
  const suffix = NAME_SUFFIXES[randInt(rng, 0, NAME_SUFFIXES.length - 1)];
  return `${prefix}${suffix}`;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Recomputes clusters from current citizen positions and reconciles them
 * against the registry: matched clusters overwrite their record wholesale
 * (safe since this is a pure derived pass, not an incremental patch);
 * unmatched clusters accumulate sustain-ticks in a transient scratch map
 * until they cross SETTLEMENT_FOUND_THRESHOLD_TICKS and get registered;
 * registered settlements whose cluster has dropped below TIER_HUT_MIN get a
 * dissolve-grace countdown rather than immediate deletion, to absorb
 * single-tick population noise.
 */
export function updateSettlementRegistry(
  registry: SettlementRegistry,
  citizens: CitizenStore,
  homes: HomeRegistry,
  terrain: TerrainGrid,
  tick: number,
  rng: Rng,
  cellPopScratch: Uint16Array,
): void {
  const clusters = computeClusters(citizens, terrain, cellPopScratch);

  const matchedSettlementIds = new Set<number>();
  const matchedClusterIndices = new Set<number>();

  // Pass 1: match clusters at/above TIER_HUT_MIN population to existing
  // settlements by nearest centroid within SETTLEMENT_MATCH_RADIUS.
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    if (cluster.population < TIER_HUT_MIN) continue;

    let bestId: number | undefined;
    let bestDistSq = SETTLEMENT_MATCH_RADIUS * SETTLEMENT_MATCH_RADIUS;
    for (const record of registry.settlements.values()) {
      if (matchedSettlementIds.has(record.id)) continue;
      const d = distSq(cluster.centroidX, cluster.centroidY, record.centroidX, record.centroidY);
      if (d <= bestDistSq) {
        bestId = record.id;
        bestDistSq = d;
      }
    }

    if (bestId !== undefined) {
      matchedSettlementIds.add(bestId);
      matchedClusterIndices.add(ci);
      const record = registry.settlements.get(bestId)!;
      const baseTier = tierFromPopulation(cluster.population) ?? "hut";
      const bonus = materialBonusFor(cluster, homes, terrain);
      record.centroidX = cluster.centroidX;
      record.centroidY = cluster.centroidY;
      record.population = cluster.population;
      record.memberCellIndices = cluster.memberCellIndices;
      record.tier = bonus > TIER_MATERIAL_BONUS_THRESHOLD ? bumpTier(baseTier) : baseTier;
      record.graceTicksRemaining = null;
    }
  }

  // Pass 2: unmatched registered settlements — start/continue dissolve grace.
  for (const record of registry.settlements.values()) {
    if (matchedSettlementIds.has(record.id)) continue;
    if (record.graceTicksRemaining === null) {
      record.graceTicksRemaining = SETTLEMENT_DISSOLVE_GRACE_TICKS;
    } else {
      record.graceTicksRemaining--;
      if (record.graceTicksRemaining <= 0) {
        registry.settlements.delete(record.id);
      }
    }
  }

  // Pass 3: merges — if two *registered* settlements' matched clusters ended
  // up spatially coincident (rare, since pass 1 already matches by nearest
  // centroid; this handles the case where a cluster grew to absorb what used
  // to be two separate settlements' territory), keep the older.
  const byId = [...registry.settlements.values()];
  for (let i = 0; i < byId.length; i++) {
    for (let j = i + 1; j < byId.length; j++) {
      const a = byId[i];
      const b = byId[j];
      if (!registry.settlements.has(a.id) || !registry.settlements.has(b.id)) continue;
      if (distSq(a.centroidX, a.centroidY, b.centroidX, b.centroidY) <= SETTLEMENT_MATCH_RADIUS * SETTLEMENT_MATCH_RADIUS) {
        const older = a.foundingTick <= b.foundingTick ? a : b;
        const younger = a.foundingTick <= b.foundingTick ? b : a;
        older.population += younger.population;
        for (const idx of younger.memberCellIndices) older.memberCellIndices.add(idx);
        registry.settlements.delete(younger.id);
      }
    }
  }

  // Pass 4: unmatched clusters at/above TIER_HUT_MIN — sustain-track toward
  // founding. Matched against existing pending entries by nearest centroid
  // within SETTLEMENT_MATCH_RADIUS (same tolerance registered settlements
  // use), so a cluster's sustain count survives citizens shuffling between
  // member cells as long as the cluster's overall position stays put.
  const matchedPendingIds = new Set<number>();
  for (let ci = 0; ci < clusters.length; ci++) {
    if (matchedClusterIndices.has(ci)) continue;
    const cluster = clusters[ci];
    if (cluster.population < TIER_HUT_MIN) continue;

    let bestPendingId: number | undefined;
    let bestDistSq = SETTLEMENT_MATCH_RADIUS * SETTLEMENT_MATCH_RADIUS;
    for (const pending of registry.pendingClusters.values()) {
      if (matchedPendingIds.has(pending.id)) continue;
      const d = distSq(cluster.centroidX, cluster.centroidY, pending.centroidX, pending.centroidY);
      if (d <= bestDistSq) {
        bestPendingId = pending.id;
        bestDistSq = d;
      }
    }

    let pending: PendingCluster;
    if (bestPendingId !== undefined) {
      pending = registry.pendingClusters.get(bestPendingId)!;
      pending.centroidX = cluster.centroidX;
      pending.centroidY = cluster.centroidY;
      pending.sustainedTicks++;
    } else {
      pending = {
        id: registry.nextPendingId++,
        centroidX: cluster.centroidX,
        centroidY: cluster.centroidY,
        sustainedTicks: 1,
      };
      registry.pendingClusters.set(pending.id, pending);
    }
    matchedPendingIds.add(pending.id);

    if (pending.sustainedTicks >= SETTLEMENT_FOUND_THRESHOLD_TICKS) {
      const baseTier = tierFromPopulation(cluster.population) ?? "hut";
      const bonus = materialBonusFor(cluster, homes, terrain);
      const record: SettlementRecord = {
        id: registry.nextId++,
        name: generateSettlementName(rng),
        foundingTick: tick,
        centroidX: cluster.centroidX,
        centroidY: cluster.centroidY,
        tier: bonus > TIER_MATERIAL_BONUS_THRESHOLD ? bumpTier(baseTier) : baseTier,
        population: cluster.population,
        memberCellIndices: cluster.memberCellIndices,
        graceTicksRemaining: null,
      };
      registry.settlements.set(record.id, record);
      registry.pendingClusters.delete(pending.id);
      matchedPendingIds.delete(pending.id);
    }
  }

  // Prune pending entries not matched this tick, so a cluster that dissolved
  // before founding doesn't leave a stale counter behind forever.
  for (const [id] of registry.pendingClusters) {
    if (!matchedPendingIds.has(id)) registry.pendingClusters.delete(id);
  }
}
