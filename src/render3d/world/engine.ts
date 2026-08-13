// World orchestrator — reworked from kuku's world/engine.ts, not a port.
// Same shape (a create...(options) factory returning a handle with
// update/dispose), but options are WireSnapshotV1-native instead of kuku's
// note-graph shape (nodes/links/adjacencyMap/clusters/mood/compact).
//
// Composes sky + terrain + homes + citizens + materials + settlements.
// Citizens' visual smoothing (steer-toward-target, Phase 2) happens inside
// citizens.update() each frame — this file just calls it. Phase 3 adds
// settlement markers, the ported indicators.ts (selection ring, driven by
// selection.ts), and per-layer group references so main.ts can toggle
// ground/map LOD visibility. Hearths and night-cycle palette blending are
// later phases and not wired in yet.

import { Group } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import { createCitizens, type CitizensHandle } from "./citizens.ts";
import { createHomes, type HomesHandle } from "./homes.ts";
import { createInteractionIndicators, type InteractionIndicatorsHandle } from "./indicators.ts";
import { createMaterials, type MaterialsHandle } from "./materials.ts";
import { paletteForMood, type WorldPalette } from "./palette.ts";
import { createSettlements, type SettlementsHandle } from "./settlements.ts";
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
  /** Ground-view-only layers (citizens/homes/materials) — toggle .visible
   * on this for the ground/map LOD switch. */
  groundLayers: Group;
  /** Map-view-only layers (settlement markers) — toggle .visible on this
   * for the ground/map LOD switch. */
  mapLayers: Group;
  citizens: CitizensHandle;
  settlements: SettlementsHandle;
  indicators: InteractionIndicatorsHandle;
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

  // Ground-view-only: individual citizens/homes/materials. Map-view-only:
  // settlement markers. Sky and terrain stay visible in both modes (the
  // world itself doesn't disappear when zoomed out, only the fine detail).
  const groundLayers = new Group();
  const mapLayers = new Group();
  group.add(groundLayers, mapLayers);

  const homes: HomesHandle = createHomes(palette);
  groundLayers.add(homes.group);

  const citizens: CitizensHandle = createCitizens(palette);
  groundLayers.add(citizens.group);

  const materials: MaterialsHandle = createMaterials(palette);
  groundLayers.add(materials.group);

  const settlements: SettlementsHandle = createSettlements(palette);
  mapLayers.add(settlements.group);

  // Indicators (selection ring) render in both modes conceptually, but
  // since selection only targets citizens (Phase 3 scope, matching the old
  // 2D renderer's citizen-only selection), it's only ever visible while
  // groundLayers is — added directly to the world group rather than either
  // LOD group so selection.ts (which owns write()/clear() calls) doesn't
  // need to know about LOD state.
  const indicators: InteractionIndicatorsHandle = createInteractionIndicators(palette);
  group.add(indicators.mesh);

  function applySnapshot(snapshot: WireSnapshotV1): void {
    terrain.applyTerrain(snapshot.terrain);
    homes.applyHomes(snapshot.homes);
    citizens.applyCitizens(snapshot.citizens);
    materials.applyMaterials(snapshot.materials);
    settlements.applySettlements(snapshot.settlements);
    // weather is a later phase (world/weatherFx.ts, Phase 6).
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
    settlements.dispose();
    indicators.dispose();
  }

  return {
    group,
    palette,
    worldRadius,
    groundLayers,
    mapLayers,
    citizens,
    settlements,
    indicators,
    applySnapshot,
    update,
    dispose,
  };
}
