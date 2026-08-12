// Renders the terrain grid as subtle per-cell tinting, from the latest
// server-broadcast wire-format terrain + weather data. Rebuilt on every
// incoming snapshot the caller chooses to redraw for (main.ts no longer
// throttles this by a local tick counter — see main.ts's comment on why
// TERRAIN_REDRAW_INTERVAL_TICKS was dropped).
//
// Tint formula: base resource/capacity lerp, then nudged toward
// PATH_WEAR_TINT by how worn the cell is, then — if the cell falls inside
// an active weather region — nudged toward WEATHER_TINT. Still one
// rect().fill() per cell per call, no incremental diffing.

import { Container, Graphics } from "pixi.js";
import { PATH_WEAR_MAX, PATH_WEAR_TINT_STRENGTH, WEATHER_TINT_STRENGTH } from "../sim/constants.ts";
import type { WireSnapshotV1 } from "../shared/wireFormat.ts";
import { PATH_WEAR_TINT, TERRAIN_HIGH_TINT, TERRAIN_LOW_TINT, WEATHER_TINT } from "./colors.ts";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function packColor(c: { r: number; g: number; b: number }): number {
  return (Math.round(c.r) << 16) | (Math.round(c.g) << 8) | Math.round(c.b);
}

export function createTerrainLayer(terrain: WireSnapshotV1["terrain"]): Container {
  const container = new Container();
  const graphics = new Graphics();
  container.addChild(graphics);
  drawTerrain(graphics, terrain, undefined);
  return container;
}

export function updateTerrainLayer(
  layer: Container,
  terrain: WireSnapshotV1["terrain"],
  weather?: WireSnapshotV1["weather"],
): void {
  const graphics = layer.children[0] as Graphics;
  drawTerrain(graphics, terrain, weather);
}

function isInWeatherRegion(weather: WireSnapshotV1["weather"], x: number, y: number): boolean {
  if (!weather.active) return false;
  const dx = x - weather.regionCx;
  const dy = y - weather.regionCy;
  return dx * dx + dy * dy <= weather.regionRadius * weather.regionRadius;
}

function drawTerrain(
  graphics: Graphics,
  terrain: WireSnapshotV1["terrain"],
  weather: WireSnapshotV1["weather"] | undefined,
): void {
  graphics.clear();
  const { cols, rows, cellSize, resource, capacity, pathWear } = terrain;
  const weatherActive = weather?.active ?? false;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;

      const resourceRatio = capacity[idx] > 0 ? resource[idx] / capacity[idx] : 0;
      let rgb = lerpRgb(TERRAIN_LOW_TINT, TERRAIN_HIGH_TINT, Math.max(0, Math.min(1, resourceRatio)));

      const wearRatio = Math.min(1, pathWear[idx] / PATH_WEAR_MAX);
      if (wearRatio > 0) {
        rgb = lerpRgb(rgb, PATH_WEAR_TINT, wearRatio * PATH_WEAR_TINT_STRENGTH);
      }

      if (weatherActive && weather) {
        const centerX = cx * cellSize + cellSize / 2;
        const centerY = cy * cellSize + cellSize / 2;
        if (isInWeatherRegion(weather, centerX, centerY)) {
          rgb = lerpRgb(rgb, WEATHER_TINT, WEATHER_TINT_STRENGTH);
        }
      }

      graphics.rect(cx * cellSize, cy * cellSize, cellSize, cellSize).fill(packColor(rgb));
    }
  }
}
