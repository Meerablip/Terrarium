// Settlement markers — reworked from the old 2D render/settlementLayer.ts
// (map-view tier icons), not ported from kuku directly. Kuku conflates
// "island" (folder-cluster) and "building" (per-note house) via
// voxel_layout.ts's circle-packing/sunflower placement; Terrarium's
// settlements already carry an authoritative sim-computed centroid
// (WireSnapshotV1.settlements[].centroidX/Y) — no placement algorithm is
// needed, only a size/color read from tier + population. See the
// implementation plan's note on why voxel_layout.ts's packing math isn't
// reused here (nothing needs to be packed; positions are already given).
//
// Road-line rendering between worn-route settlement pairs (the old
// settlementLayer.ts's averageWearAlongRoute logic) is deliberately NOT
// ported yet — the plan lists paths/roads as deferred/optional, not part
// of the initial phases. Only tier-sized/colored markers are built here.

import { ConeGeometry, Group, Mesh, type Object3D } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import type { WorldPalette } from "./palette.ts";
import { toonMaterial } from "./toon.ts";

export interface SettlementsHandle {
  group: Group;
  applySettlements(settlements: WireSnapshotV1["settlements"]): void;
  /** World-space anchor for a settlement, e.g. for label projection. */
  anchorFor(settlementId: number): Object3D | null;
  dispose(): void;
}

type Tier = WireSnapshotV1["settlements"][number]["tier"];

// One step taller/darker per tier, echoing the old 2D renderer's
// TIER_ICON_SIZE (8/12/18) and SETTLEMENT_TIER_COLORS (progressively
// darker/richer) conventions, re-expressed as palette fields + 3D marker
// height instead of hardcoded hex + circle radius.
const TIER_RADIUS: Record<Tier, number> = { hut: 4, village: 6, city: 9 };
const TIER_HEIGHT: Record<Tier, number> = { hut: 6, village: 9, city: 13.5 };
const TIER_PALETTE_KEY: Record<Tier, keyof WorldPalette> = {
  hut: "plaza",
  village: "roofRidge",
  city: "ink",
};

interface SettlementEntry {
  root: Object3D;
  mesh: Mesh;
  tier: Tier;
}

export function createSettlements(palette: WorldPalette): SettlementsHandle {
  const group = new Group();
  const entries = new Map<number, SettlementEntry>();

  // One cone geometry + material per tier, shared across all settlements of
  // that tier — a settlement's marker is a beacon-like cone (visible from
  // the bird's-eye camera angle, reads clearly at map-view distance).
  const geometryByTier: Record<Tier, ConeGeometry> = {
    hut: new ConeGeometry(TIER_RADIUS.hut, TIER_HEIGHT.hut, 6),
    village: new ConeGeometry(TIER_RADIUS.village, TIER_HEIGHT.village, 6),
    city: new ConeGeometry(TIER_RADIUS.city, TIER_HEIGHT.city, 8),
  };
  const materialByTier: Record<Tier, ReturnType<typeof toonMaterial>> = {
    hut: toonMaterial(palette, { outline: true }),
    village: toonMaterial(palette, { outline: true }),
    city: toonMaterial(palette, { outline: true }),
  };
  for (const tier of Object.keys(materialByTier) as Tier[]) {
    materialByTier[tier].color.set(palette[TIER_PALETTE_KEY[tier]] as string);
  }

  function createEntry(tier: Tier): SettlementEntry {
    const root = new Group();
    const mesh = new Mesh(geometryByTier[tier], materialByTier[tier]);
    mesh.position.y = TIER_HEIGHT[tier] / 2;
    root.add(mesh);
    group.add(root);
    return { root, mesh, tier };
  }

  function swapTier(entry: SettlementEntry, tier: Tier): SettlementEntry {
    entry.root.remove(entry.mesh);
    const mesh = new Mesh(geometryByTier[tier], materialByTier[tier]);
    mesh.position.y = TIER_HEIGHT[tier] / 2;
    entry.root.add(mesh);
    return { root: entry.root, mesh, tier };
  }

  function applySettlements(settlements: WireSnapshotV1["settlements"]): void {
    const liveIds = new Set(settlements.map((s) => s.id));
    for (const [id, entry] of entries) {
      if (!liveIds.has(id)) {
        group.remove(entry.root);
        entries.delete(id);
      }
    }

    for (const settlement of settlements) {
      let entry = entries.get(settlement.id);
      if (!entry) {
        entry = createEntry(settlement.tier);
        entries.set(settlement.id, entry);
      } else if (entry.tier !== settlement.tier) {
        entry = swapTier(entry, settlement.tier);
        entries.set(settlement.id, entry);
      }
      entry.root.position.set(settlement.centroidX, 0, settlement.centroidY);
    }
  }

  function anchorFor(settlementId: number): Object3D | null {
    return entries.get(settlementId)?.root ?? null;
  }

  function dispose(): void {
    for (const tier of Object.keys(geometryByTier) as Tier[]) {
      geometryByTier[tier].dispose();
      materialByTier[tier].dispose();
    }
  }

  return { group, applySettlements, anchorFor, dispose };
}
