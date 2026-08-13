// World orchestrator — reworked from kuku's world/engine.ts, not a port.
// Same shape (a create...(options) factory returning a handle with
// update/dispose), but options are WireSnapshotV1-native instead of kuku's
// note-graph shape (nodes/links/adjacencyMap/clusters/mood/compact).
//
// Composes sky + terrain + homes + citizens + materials. Citizens' visual
// smoothing (steer-toward-target, Phase 2) happens inside citizens.update()
// each frame — this file just calls it. Settlements, selection indicators,
// hearths, and night-cycle palette blending are later phases (see the
// render3d implementation plan) and are not wired in yet — world/
// settlements.ts, world/hearth.ts etc. don't exist until then.

import { Group } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import { createCitizens, type CitizensHandle } from "./citizens.ts";
import { createHomes, type HomesHandle } from "./homes.ts";
import { createMaterials, type MaterialsHandle } from "./materials.ts";
import { paletteForMood, type WorldPalette } from "./palette.ts";
import { createSky, type SkyHandle } from "./sky.ts";
import { createTerrain, type TerrainHandle } from "./terrain.ts";

export interface Render3DWorldOptions {
  worldWidth: number;
  worldHeight: number;
  cellSize: number;
  cols: number;
  rows: number;
}

export interface Render3DWorldHandle {
  group: Group;
  palette: WorldPalette;
  worldRadius: number;
  /** Called once per incoming WireSnapshotV1 — NOT per render frame. Mirrors
   * the plan's two-cadence split (applySnapshot vs. update). */
  applySnapshot(snapshot: WireSnapshotV1): void;
  /** Called once per animation frame. */
  update(nowSeconds: number, deltaSeconds: number): void;
  dispose(): void;
}

export function createRender3DWorld(options: Render3DWorldOptions): Render3DWorldHandle {
  const group = new Group();
  const palette = paletteForMood("day"); // night cycle wired in Phase 4

  // Half the terrain's diagonal: the actual distance from world center to
  // its farthest corner. Sky's hill rings are sized as multiples of this
  // (1.42x-2.6x, see world/sky.ts) so they sit clear of the terrain edge as
  // a distant backdrop rather than crowding the camera.
  const worldRadius = Math.hypot(options.worldWidth, options.worldHeight) / 2;

  const sky: SkyHandle = createSky(palette, worldRadius);
  group.add(sky.group);

  const terrain: TerrainHandle = createTerrain(
    palette,
    options.cols,
    options.rows,
    options.cellSize,
  );
  group.add(terrain.group);

  const homes: HomesHandle = createHomes(palette);
  group.add(homes.group);

  const citizens: CitizensHandle = createCitizens(palette);
  group.add(citizens.group);

  const materials: MaterialsHandle = createMaterials(palette);
  group.add(materials.group);

  function applySnapshot(snapshot: WireSnapshotV1): void {
    terrain.applyTerrain(snapshot.terrain);
    homes.applyHomes(snapshot.homes);
    citizens.applyCitizens(snapshot.citizens);
    materials.applyMaterials(snapshot.materials);
    // settlements[]/weather are later phases (world/settlements.ts Phase 3,
    // weatherFx.ts Phase 6).
  }

  function update(nowSeconds: number, deltaSeconds: number): void {
    sky.update(nowSeconds);
    citizens.update(deltaSeconds);
  }

  function dispose(): void {
    sky.dispose();
    terrain.dispose();
    homes.dispose();
    citizens.dispose();
    materials.dispose();
  }

  return { group, palette, worldRadius, applySnapshot, update, dispose };
}
