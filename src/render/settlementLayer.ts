// Map-view-only layer: tier-appropriate icons for each registered
// settlement, plus road lines between settlement pairs whose connecting
// route's average pathWear exceeds ROAD_WEAR_THRESHOLD. Synced from the
// latest server-broadcast wire-format settlements + terrain arrays. One
// Graphics object, full clear + redraw per call (matches terrainLayer.ts's
// existing non-incremental precedent) — cheap since settlement count is
// small and this is throttled by the caller.
//
// Grid-index math (world coords -> cell index) is inlined here rather than
// reusing src/sim/terrain.ts's worldToCell/cellIndex helpers, since those
// take a full TerrainGrid — constructing a fake one just to satisfy that
// signature would be exactly the kind of accidental complexity the wire
// format's strict-subset design is meant to avoid. The math itself
// (floor(x/cellSize), clamp, cy*cols+cx) is a few lines, not worth a shared
// abstraction for this one read-only call site.

import { Container, Graphics } from "pixi.js";
import { ROAD_WEAR_THRESHOLD } from "../sim/constants.ts";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { SETTLEMENT_TIER_COLORS } from "./colors.ts";

export function createSettlementLayer(): Container {
  const container = new Container();
  container.addChild(new Graphics());
  return container;
}

const TIER_ICON_SIZE: Record<WireSnapshotV1["settlements"][number]["tier"], number> = {
  hut: 8,
  village: 12,
  city: 18,
};

interface WireTerrain {
  cols: number;
  rows: number;
  cellSize: number;
  pathWear: number[];
}

function wearAtWorldPoint(terrain: WireTerrain, x: number, y: number): number {
  const cx = Math.max(0, Math.min(terrain.cols - 1, Math.floor(x / terrain.cellSize)));
  const cy = Math.max(0, Math.min(terrain.rows - 1, Math.floor(y / terrain.cellSize)));
  return terrain.pathWear[cy * terrain.cols + cx] ?? 0;
}

/** Average pathWear sampled in cellSize-sized steps along the straight line
 * between two settlement centroids — a cheap stand-in for "how worn is the
 * route between these two places" without real pathfinding. */
function averageWearAlongRoute(terrain: WireTerrain, ax: number, ay: number, bx: number, by: number): number {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.round(dist / terrain.cellSize));
  let total = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    total += wearAtWorldPoint(terrain, ax + (bx - ax) * t, ay + (by - ay) * t);
  }
  return total / (steps + 1);
}

function drawTierIcon(graphics: Graphics, settlement: WireSnapshotV1["settlements"][number]): void {
  const size = TIER_ICON_SIZE[settlement.tier];
  const color = SETTLEMENT_TIER_COLORS[settlement.tier];
  graphics.circle(settlement.centroidX, settlement.centroidY, size / 2).fill(color);
}

export function syncSettlementLayer(
  layer: Container,
  settlements: WireSnapshotV1["settlements"],
  terrain: WireTerrain,
): void {
  const graphics = layer.children[0] as Graphics;
  graphics.clear();

  for (let i = 0; i < settlements.length; i++) {
    for (let j = i + 1; j < settlements.length; j++) {
      const a = settlements[i];
      const b = settlements[j];
      const avgWear = averageWearAlongRoute(terrain, a.centroidX, a.centroidY, b.centroidX, b.centroidY);
      if (avgWear >= ROAD_WEAR_THRESHOLD) {
        graphics
          .moveTo(a.centroidX, a.centroidY)
          .lineTo(b.centroidX, b.centroidY)
          .stroke({ width: 2, color: SETTLEMENT_TIER_COLORS.hut, alpha: 0.6 });
      }
    }
  }

  for (const settlement of settlements) {
    drawTierIcon(graphics, settlement);
  }
}
