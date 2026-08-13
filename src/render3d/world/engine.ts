// World orchestrator — reworked from kuku's world/engine.ts, not a port.
// Same shape (a create...(options) factory returning a handle with
// update/dispose), but options are WireSnapshotV1-native instead of kuku's
// note-graph shape (nodes/links/adjacencyMap/clusters/mood/compact).
//
// Composes sky + terrain + homes + citizens + materials + settlements.
// Citizens' visual smoothing (steer-toward-target, Phase 2) happens inside
// citizens.update() each frame — this file just calls it. Phase 3 added
// settlement markers, the ported indicators.ts (selection ring, driven by
// selection.ts), and per-layer group references so main.ts can toggle
// ground/map LOD visibility.
//
// Phase 4 (day/night cycle): tracks the latest snapshot's `tick`, but
// extrapolates a continuously-advancing "effective tick" between snapshots
// (tick only refreshes at the 10Hz broadcast cadence; the blend factor
// needs to move smoothly at 60fps) so the palette lerp doesn't visibly
// stair-step between snapshot arrivals. Every world module's applyPalette
// is called every frame (cheap — a handful of Color.set() calls each);
// sky.ts's applyPaletteVertexColors (dome+hills vertex-color rebuild, the
// one genuinely expensive part) is called at a coarser fixed cadence
// instead, per the plan's toon-gradient-cache-thrash guidance (which, on
// closer inspection of toon.ts, turned out to apply to this vertex-color
// case rather than the toon gradient texture itself — see toon.ts's
// updated comment).

import { Group } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import { SERVER_TICK_HZ } from "../../server/constants.ts";
import { nightBlendFactorForTick } from "../dayNightCycle.ts";
import { createCitizens, type CitizensHandle } from "./citizens.ts";
import { createHomes, type HomesHandle } from "./homes.ts";
import { createInteractionIndicators, type InteractionIndicatorsHandle } from "./indicators.ts";
import { createMaterials, type MaterialsHandle } from "./materials.ts";
import { blendedDayNightPalette } from "./paletteBlend.ts";
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
  /** The current, possibly day/night-blended palette — read fresh each
   * frame by callers that need it directly (e.g. main.ts's scene.background
   * / scene.fog), NOT captured once at construction. */
  readonly palette: WorldPalette;
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

// How often (seconds) to rebuild the sky's baked dome/hills vertex-color
// gradients from the current blended palette. Day/night transitions ramp
// over ~24s (dayNightCycle.ts's TRANSITION_FRACTION * DAY_NIGHT_CYCLE_TICKS
// at 20 ticks/sec) — recomputing a few times/sec is imperceptibly stepped
// against that pace, versus doing the full dome+hills vertex rewrite at 60fps
// for no visible benefit.
const SKY_VERTEX_RECOMPUTE_INTERVAL_SECONDS = 0.2;

export function createRender3DWorld(options: Render3DWorldOptions): Render3DWorldHandle {
  const group = new Group();
  let palette = paletteForMood("day"); // reassigned every frame once a snapshot has arrived

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

  // Latest known tick + the wall-clock moment it was received, so update()
  // can extrapolate a smoothly-advancing effective tick between snapshots
  // (ticks only refresh at the 10Hz broadcast cadence; the render loop
  // runs at 60fps and needs the blend factor to move every frame, not
  // stair-step 10x/sec).
  let lastKnownTick = 0;
  let lastKnownTickAtSeconds: number | null = null;
  let sinceLastSkyVertexRecompute = 0;

  function applySnapshot(snapshot: WireSnapshotV1): void {
    lastKnownTick = snapshot.tick;
    lastKnownTickAtSeconds = null; // re-anchored on the next update() call

    terrain.applyTerrain(snapshot.terrain);
    homes.applyHomes(snapshot.homes);
    citizens.applyCitizens(snapshot.citizens);
    materials.applyMaterials(snapshot.materials);
    settlements.applySettlements(snapshot.settlements);
    // weather is a later phase (world/weatherFx.ts, Phase 6).
  }

  function update(nowSeconds: number, deltaSeconds: number): void {
    if (lastKnownTickAtSeconds === null) lastKnownTickAtSeconds = nowSeconds;
    const elapsedSeconds = nowSeconds - lastKnownTickAtSeconds;
    const effectiveTick = lastKnownTick + elapsedSeconds * SERVER_TICK_HZ;

    const nightBlend = nightBlendFactorForTick(effectiveTick);
    palette = blendedDayNightPalette(nightBlend);

    sky.applyPalette(palette);
    terrain.applyPalette(palette);
    homes.applyPalette(palette);
    citizens.applyPalette(palette);
    materials.applyPalette(palette);
    settlements.applyPalette(palette);

    sinceLastSkyVertexRecompute += deltaSeconds;
    if (sinceLastSkyVertexRecompute >= SKY_VERTEX_RECOMPUTE_INTERVAL_SECONDS) {
      sinceLastSkyVertexRecompute = 0;
      sky.applyPaletteVertexColors(palette);
    }

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
    get palette() {
      return palette;
    },
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
