// Material prop markers — net-new, no kuku equivalent. Kuku's closest
// concept (WorkSite, in its nature.ts) is a job-destination for agents, not
// a physical pickup-able resource node, so it doesn't fit — see the
// implementation plan's snapshotAdapter section for why this needed to be
// designed from scratch rather than ported/adapted.
//
// Small instanced markers built from the ported batch.ts primitive
// (world/batch.ts), colored/shaped by material kind (0=wood, 1=stone, per
// WireSnapshotV1). Diff-by-id, same shape as the old 2D renderer's
// render/materialLayer.ts.

import { CylinderGeometry, Group, Mesh, type Object3D } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import type { WorldPalette } from "./palette.ts";
import { toonMaterial } from "./toon.ts";

export interface MaterialsHandle {
  group: Group;
  applyMaterials(materials: WireSnapshotV1["materials"]): void;
  dispose(): void;
}

const MARKER_RADIUS = 0.8;
const MARKER_HEIGHT = 1.2;
const GROUND_Y = MARKER_HEIGHT / 2;

// kind: 0 = wood, 1 = stone (see WireSnapshotV1.materials[].kind).
const KIND_PALETTE_KEYS = ["trunk", "rock"] as const;

export function createMaterials(palette: WorldPalette): MaterialsHandle {
  const group = new Group();
  const roots = new Map<number, Object3D>();

  const geometry = new CylinderGeometry(MARKER_RADIUS, MARKER_RADIUS * 1.15, MARKER_HEIGHT, 6);
  const materialsByKind = KIND_PALETTE_KEYS.map((key) => {
    const material = toonMaterial(palette, { outline: true });
    material.color.set(palette[key]);
    return material;
  });

  function createEntry(kind: number): Object3D {
    const material = materialsByKind[kind] ?? materialsByKind[0];
    const mesh = new Mesh(geometry, material);
    mesh.position.y = GROUND_Y;
    group.add(mesh);
    return mesh;
  }

  function applyMaterials(materials: WireSnapshotV1["materials"]): void {
    const liveIds = new Set(materials.map((m) => m.id));
    for (const [id, root] of roots) {
      if (!liveIds.has(id)) {
        group.remove(root);
        roots.delete(id);
      }
    }

    for (const material of materials) {
      let root = roots.get(material.id);
      if (!root) {
        root = createEntry(material.kind);
        roots.set(material.id, root);
      }
      root.position.x = material.x;
      root.position.z = material.y;
    }
  }

  function dispose(): void {
    geometry.dispose();
    for (const material of materialsByKind) material.dispose();
  }

  return { group, applyMaterials, dispose };
}
