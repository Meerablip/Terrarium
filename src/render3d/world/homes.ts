// Home meshes — reworked from kuku's world/buildings.ts, not a port. Kuku
// places one GLB-variant house per note, tiered 0-3 by document length; here
// `homes[]` already carries authoritative x/y from the sim (no placement
// algorithm needed) and only a binary complete/incomplete distinction plus a
// buildProgress ratio (no tier field exists in WireSnapshotV1). Phase 1 uses
// primitive geometry (box + roof prism), not GLB art — see the "Asset
// sourcing" section of the implementation plan for why.
//
// Same create/update/destroy-by-id diffing shape as the old 2D renderer's
// render/homeLayer.ts, translated to three.js meshes instead of Pixi
// Graphics. A home's mesh swaps from bare scaffolding (a low box, no roof)
// to a finished cottage (box + roof prism) when `complete` flips — mirroring
// homeLayer.ts's `completeState` map that only redraws on an actual flip —
// plus a filling progress bar above the scaffolding, the Clash-of-Clans-
// style build indicator the buildProgress wire-format addition exists for.

import {
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import type { WorldPalette } from "./palette.ts";
import { toonMaterial } from "./toon.ts";

export interface HomesHandle {
  group: Group;
  applyHomes(homes: WireSnapshotV1["homes"]): void;
  /** World-space anchor for a home, e.g. for hearth placement in a later
   * phase — mirrors kuku's doorPosition/roofPosition helper pattern. */
  anchorFor(homeId: number): Object3D | null;
  /** Re-tints every shared material from a (possibly day/night-blended)
   * palette — cheap (a handful of Color.set() calls), safe to call every
   * frame from the day/night blend driver. */
  applyPalette(palette: WorldPalette): void;
  dispose(): void;
}

const SCAFFOLD_SIZE = 6;
const SCAFFOLD_HEIGHT = 2.5;
const HOUSE_WIDTH = 8;
const HOUSE_DEPTH = 8;
const HOUSE_WALL_HEIGHT = 5;
const HOUSE_ROOF_HEIGHT = 4;

const BAR_WIDTH = 7;
const BAR_HEIGHT = 0.8;
const BAR_Y_OFFSET = SCAFFOLD_HEIGHT + 1.5;

interface HomeEntry {
  root: Object3D;
  scaffold: Mesh;
  house: Group;
  barTrack: Mesh;
  barFill: Mesh;
  complete: boolean;
}

export function createHomes(palette: WorldPalette): HomesHandle {
  const group = new Group();
  const entries = new Map<number, HomeEntry>();

  // Shared geometry/materials across every home instance — homes.ts builds
  // individual meshes (not instanced) for Phase 1 simplicity, since home
  // counts are expected to stay in the tens-to-low-hundreds range; revisit
  // with VoxelBatch instancing (world/batch.ts) if that assumption breaks.
  const scaffoldGeometry = new BoxGeometry(SCAFFOLD_SIZE, SCAFFOLD_HEIGHT, SCAFFOLD_SIZE);
  const scaffoldMaterial = toonMaterial(palette, { outline: true });
  scaffoldMaterial.color.set(palette.foundation);

  const wallGeometry = new BoxGeometry(HOUSE_WIDTH, HOUSE_WALL_HEIGHT, HOUSE_DEPTH);
  const wallMaterial = toonMaterial(palette, { outline: true });
  wallMaterial.color.set(palette.wall);

  const roofGeometry = new ConeGeometry(HOUSE_WIDTH * 0.78, HOUSE_ROOF_HEIGHT, 4);
  const roofMaterial = toonMaterial(palette, { outline: true });
  roofMaterial.color.set(palette.roof);

  const barTrackGeometry = new BoxGeometry(BAR_WIDTH, BAR_HEIGHT, 0.2);
  const barTrackMaterial = new MeshBasicMaterial({ color: palette.wallShadow });

  const barFillGeometry = new BoxGeometry(1, BAR_HEIGHT * 0.7, 0.24);
  const barFillMaterial = new MeshBasicMaterial({ color: palette.focusFlag });

  function buildHouse(): Group {
    const house = new Group();
    const walls = new Mesh(wallGeometry, wallMaterial);
    walls.position.y = HOUSE_WALL_HEIGHT / 2;
    const roof = new Mesh(roofGeometry, roofMaterial);
    roof.position.y = HOUSE_WALL_HEIGHT + HOUSE_ROOF_HEIGHT / 2;
    roof.rotation.y = Math.PI / 4;
    house.add(walls, roof);
    return house;
  }

  function createEntry(): HomeEntry {
    const root = new Group();

    const scaffold = new Mesh(scaffoldGeometry, scaffoldMaterial);
    scaffold.position.y = SCAFFOLD_HEIGHT / 2;

    const house = buildHouse();
    house.visible = false;

    const barTrack = new Mesh(barTrackGeometry, barTrackMaterial);
    barTrack.position.y = BAR_Y_OFFSET;
    const barFill = new Mesh(barFillGeometry, barFillMaterial);
    barFill.position.y = BAR_Y_OFFSET;

    root.add(scaffold, house, barTrack, barFill);
    group.add(root);

    return { root, scaffold, house, barTrack, barFill, complete: false };
  }

  function setBuildProgress(entry: HomeEntry, ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    // Scale from the left edge: shift the fill's origin so it grows rightward
    // rather than from its center, matching a typical progress-bar fill.
    entry.barFill.scale.x = Math.max(0.001, clamped * BAR_WIDTH);
    entry.barFill.position.x = -BAR_WIDTH / 2 + (clamped * BAR_WIDTH) / 2;
  }

  function applyHomes(homes: WireSnapshotV1["homes"]): void {
    const liveIds = new Set(homes.map((h) => h.id));
    for (const [id, entry] of entries) {
      if (!liveIds.has(id)) {
        group.remove(entry.root);
        entries.delete(id);
      }
    }

    for (const home of homes) {
      let entry = entries.get(home.id);
      if (!entry) {
        entry = createEntry();
        entries.set(home.id, entry);
      }

      entry.root.position.set(home.x, 0, home.y);

      if (entry.complete !== home.complete) {
        entry.scaffold.visible = !home.complete;
        entry.house.visible = home.complete;
        entry.barTrack.visible = !home.complete;
        entry.barFill.visible = !home.complete;
        entry.complete = home.complete;
      }

      if (!home.complete) {
        setBuildProgress(entry, home.buildProgress);
      }
    }
  }

  function anchorFor(homeId: number): Object3D | null {
    return entries.get(homeId)?.root ?? null;
  }

  function applyPalette(nextPalette: WorldPalette): void {
    scaffoldMaterial.color.set(nextPalette.foundation);
    wallMaterial.color.set(nextPalette.wall);
    roofMaterial.color.set(nextPalette.roof);
    barTrackMaterial.color.set(nextPalette.wallShadow);
    barFillMaterial.color.set(nextPalette.focusFlag);
  }

  function dispose(): void {
    scaffoldGeometry.dispose();
    scaffoldMaterial.dispose();
    wallGeometry.dispose();
    wallMaterial.dispose();
    roofGeometry.dispose();
    roofMaterial.dispose();
    barTrackGeometry.dispose();
    barTrackMaterial.dispose();
    barFillGeometry.dispose();
    barFillMaterial.dispose();
  }

  return { group, applyHomes, anchorFor, applyPalette, dispose };
}
