// Terrain mesh — reworked from kuku's world/terrain.ts, not a port. Kuku
// builds one static ring-based landmass once and never touches it again
// (its own comment: islands are cosmetic regions on a single flat plain).
// Terrarium's terrain is the opposite: a live 100x100 grid whose
// resource/capacity/pathWear values change every snapshot (10Hz) and must
// visibly read as fertility + worn dirt paths each time — see the
// "Terrain updates" section of the render3d implementation plan for why
// this needed a full rework instead of an adaptation.
//
// Approach (plan's approach (a), the Phase-1 recommended starting point):
// one flat plane sized to the sim's world extent, with UNSHARED per-cell
// vertices (4 verts/cell, 2 tris/cell — not shared with neighbors) so each
// cell reads as one flat-tinted quad, matching the old 2D renderer's
// per-cell-rect look instead of blurring across cell boundaries. Colors are
// computed into one Float32Array and pushed as a single buffer-attribute
// write per snapshot, not per-vertex calls — the perf-sensitive part this
// file exists to get right first.

import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Mesh } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import { PATH_WEAR_MAX, PATH_WEAR_TINT_STRENGTH } from "../../sim/constants.ts";
import type { WorldPalette } from "./palette.ts";
import { toonMaterial } from "./toon.ts";

export interface TerrainHandle {
  group: Group;
  /** Recomputes vertex colors from a fresh terrain snapshot. Call once per
   * incoming WireSnapshotV1, not per render frame. */
  applyTerrain(terrain: WireSnapshotV1["terrain"]): void;
  dispose(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
  out: [number, number, number],
): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

export function createTerrain(
  palette: WorldPalette,
  cols: number,
  rows: number,
  cellSize: number,
): TerrainHandle {
  const group = new Group();

  const vertsPerCell = 4;
  const cellCount = cols * rows;
  const positions = new Float32Array(cellCount * vertsPerCell * 3);
  const colors = new Float32Array(cellCount * vertsPerCell * 3);
  const indices = new Uint32Array(cellCount * 6);

  // Positions never change after construction — only colors update per
  // snapshot — so they're written once here. World (x, y) maps to three.js
  // (x, z); three.js Y is up, so the ground plane sits at y=0 in local
  // space (see world/homes.ts, citizens.ts etc. for the same convention).
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const cellIndex = cy * cols + cx;
      const vBase = cellIndex * vertsPerCell * 3;
      const x0 = cx * cellSize;
      const x1 = x0 + cellSize;
      const z0 = cy * cellSize;
      const z1 = z0 + cellSize;

      // 4 corners of this cell's quad: (x0,z0) (x1,z0) (x1,z1) (x0,z1).
      positions[vBase + 0] = x0;
      positions[vBase + 1] = 0;
      positions[vBase + 2] = z0;
      positions[vBase + 3] = x1;
      positions[vBase + 4] = 0;
      positions[vBase + 5] = z0;
      positions[vBase + 6] = x1;
      positions[vBase + 7] = 0;
      positions[vBase + 8] = z1;
      positions[vBase + 9] = x0;
      positions[vBase + 10] = 0;
      positions[vBase + 11] = z1;

      const iBase = cellIndex * 6;
      const v0 = cellIndex * vertsPerCell;
      // Two triangles, wound so the face normal points +Y (up).
      indices[iBase + 0] = v0;
      indices[iBase + 1] = v0 + 2;
      indices[iBase + 2] = v0 + 1;
      indices[iBase + 3] = v0;
      indices[iBase + 4] = v0 + 3;
      indices[iBase + 5] = v0 + 2;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const colorAttribute = new BufferAttribute(colors, 3);
  colorAttribute.setUsage(DynamicDrawUsage); // rewritten every snapshot
  geometry.setAttribute("color", colorAttribute);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = toonMaterial(palette, { vertexColors: true });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);

  // Reused across applyTerrain calls to avoid per-snapshot allocation.
  const low: [number, number, number] = hexToRgb(palette.grassDark);
  const high: [number, number, number] = hexToRgb(palette.grassLight);
  const wearColor: [number, number, number] = hexToRgb(palette.pathDirt);
  const cellColor: [number, number, number] = [0, 0, 0];

  function applyTerrain(terrain: WireSnapshotV1["terrain"]): void {
    const { resource, capacity, pathWear } = terrain;
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
      const resourceRatio = capacity[cellIndex] > 0 ? resource[cellIndex] / capacity[cellIndex] : 0;
      const clampedRatio = Math.max(0, Math.min(1, resourceRatio));
      lerp3(low, high, clampedRatio, cellColor);

      const wearRatio = Math.min(1, pathWear[cellIndex] / PATH_WEAR_MAX);
      if (wearRatio > 0) {
        lerp3(cellColor, wearColor, wearRatio * PATH_WEAR_TINT_STRENGTH, cellColor);
      }

      const vBase = cellIndex * vertsPerCell * 3;
      for (let v = 0; v < vertsPerCell; v++) {
        colors[vBase + v * 3 + 0] = cellColor[0];
        colors[vBase + v * 3 + 1] = cellColor[1];
        colors[vBase + v * 3 + 2] = cellColor[2];
      }
    }
    colorAttribute.needsUpdate = true;
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { group, applyTerrain, dispose };
}
