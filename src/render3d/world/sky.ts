// Ported near-verbatim from kuku (github.com/kuku-mom/kuku), MIT License —
// see /THIRD_PARTY_NOTICES.md. Original:
// apps/desktop/src/plugins/builtin/voxel_graph/world/sky.ts
//
// One import path changed: kuku's `stableNoise` lives one directory up
// (../voxel_layout); here it's ported alongside the rest of world/ as
// ./layout.ts, so the import is `./layout.ts` instead.
//
// Phase 4 addition (day/night cycle): applyPalette/applyPaletteVertexColors
// weren't in kuku's version at all (kuku's sky is permanently daytime — see
// palette.ts's own history). Lighting/cloud color are cheap to re-apply
// every frame; the dome/hills' baked per-vertex gradients are refactored
// out of the original inline construction code into reusable closures
// (recomputeDomeColors/recomputeHillColors below) so applyPaletteVertexColors
// can recompute them from a new palette without rebuilding geometry — kept
// as a SEPARATE, coarser-cadence call from applyPalette since re-touching
// every dome+hill vertex is real work, unlike the cheap lighting/cloud path.
//
// ── Agent World Sky ──
//
// A soft painterly daytime sky: a gradient dome, a warm directional sun that
// drives the cel banding, gentle ambient + hemisphere fill, and flat cream
// clouds drifting slowly overhead.

import {
  AmbientLight,
  BackSide,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshToonMaterial,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { WorldPalette } from "./palette.ts";

import { stableNoise } from "./layout.ts";
import { noOutline } from "./toon.ts";

export interface SkyHandle {
  group: Group;
  update(nowSeconds: number): void;
  /** Re-applies a (possibly day/night-blended) palette. Lighting/cloud
   * color are cheap (a handful of Color.set() + intensity writes) and safe
   * every frame; the dome/hills' per-vertex gradient buffers are NOT
   * touched here — see applyPaletteVertexColors, meant for a coarser
   * cadence (Phase 4's "toon gradient" cost concern applies here too: full
   * dome+hills vertex recompute is real work, not a one-liner). */
  applyPalette(palette: WorldPalette): void;
  /** Recomputes the dome + hazy-hills vertex-color gradients from a
   * palette and re-uploads the buffers. Meaningfully more expensive than
   * applyPalette (iterates every dome/hill vertex) — call at a coarser
   * cadence (e.g. a few times/sec), not every frame, per the implementation
   * plan's guidance on the toon gradient texture's own cache-thrash
   * tradeoff (same reasoning applies to this baked-vertex-color case). */
  applyPaletteVertexColors(palette: WorldPalette): void;
  dispose(): void;
}

interface HillRingDef {
  radius: number;
  height: number;
  width: number;
  haze: number;
  cool: number;
  count: number;
}

export function createSky(palette: WorldPalette, worldRadius: number): SkyHandle {
  const group = new Group();
  const domeRadius = Math.max(worldRadius * 3.2, 2_400);

  // ── Lighting rig ──
  const ambient = new AmbientLight(palette.ambient, palette.ambientIntensity);
  const hemi = new HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
  const sun = new DirectionalLight(palette.sunColor, palette.sunIntensity);
  sun.position.set(worldRadius * 0.9, worldRadius * 1.4, worldRadius * 0.5);
  group.add(ambient, hemi, sun);

  // ── Gradient dome ──
  const domeGeometry = new SphereGeometry(domeRadius, 32, 20);
  const domePosition = domeGeometry.attributes.position;
  const domeColorAttribute = new Float32BufferAttribute(new Float32Array(domePosition.count * 3), 3);
  domeGeometry.setAttribute("color", domeColorAttribute);
  const domeMaterial = new MeshToonMaterial({ vertexColors: true, side: BackSide, fog: false });
  noOutline(domeMaterial);
  const dome = new Mesh(domeGeometry, domeMaterial);
  dome.renderOrder = -10;
  group.add(dome);

  function recomputeDomeColors(forPalette: WorldPalette): void {
    const top = new Color(forPalette.skyTop);
    const horizon = new Color(forPalette.skyHorizon);
    const tmp = new Color();
    const array = domeColorAttribute.array as Float32Array;
    for (let i = 0; i < domePosition.count; i++) {
      const y = domePosition.getY(i) / domeRadius; // -1..1
      const t = Math.max(0, y) ** 0.6; // bias the gradient toward the top
      tmp.copy(horizon).lerp(top, t);
      array[i * 3] = tmp.r;
      array[i * 3 + 1] = tmp.g;
      array[i * 3 + 2] = tmp.b;
    }
    domeColorAttribute.needsUpdate = true;
  }
  recomputeDomeColors(palette);

  // ── Distant hazy hills + mountains — layered atmospheric backdrop ──
  //
  // Three depth layers across the water: near forested hills, mid ridges, and a
  // far mountain range that all but dissolves into the sky. Each layer is hazed
  // (lerped toward the horizon colour) and the far ones get a subtle cool shift
  // so distance reads through atmospheric perspective.
  const hillRings: HillRingDef[] = [
    {
      radius: worldRadius * 1.42,
      height: worldRadius * 0.15,
      width: worldRadius * 0.5,
      haze: 0.42,
      cool: 0,
      count: 30,
    },
    {
      radius: worldRadius * 1.95,
      height: worldRadius * 0.26,
      width: worldRadius * 0.66,
      haze: 0.66,
      cool: 0.25,
      count: 26,
    },
    {
      radius: worldRadius * 2.6,
      height: worldRadius * 0.42,
      width: worldRadius * 0.9,
      haze: 0.86,
      cool: 0.5,
      count: 20,
    },
  ];

  // Positions are fixed at construction (deterministic from stableNoise);
  // only per-ring colors change on a palette blend. Track each ring's
  // [start, end) vertex range in the merged geometry so
  // recomputeHillColors can rewrite just the color buffer without touching
  // positions or rebuilding the merge.
  const hillGeometries: BufferGeometry[] = [];
  const ringVertexRanges: Array<{ start: number; count: number }> = [];
  for (const ring of hillRings) {
    const ringStart = hillGeometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
    for (let i = 0; i < ring.count; i++) {
      const angle =
        (i / ring.count) * Math.PI * 2 + stableNoise(`hill-a:${ring.radius}:${i}`) * 0.4;
      const r = ring.radius * (0.92 + stableNoise(`hill-r:${ring.radius}:${i}`) * 0.2);
      const h = ring.height * (0.55 + stableNoise(`hill-h:${ring.radius}:${i}`) * 0.9);
      const w = ring.width * (0.6 + stableNoise(`hill-w:${ring.radius}:${i}`) * 0.7);
      const dome2 = new SphereGeometry(1, 10, 7);
      dome2.scale(w, h, w);
      dome2.translate(Math.cos(angle) * r, -h * 0.4, Math.sin(angle) * r);
      hillGeometries.push(dome2);
    }
    const ringEnd = hillGeometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
    ringVertexRanges.push({ start: ringStart, count: ringEnd - ringStart });
  }
  const hillGeometry = mergeGeometries(hillGeometries);
  for (const geometry of hillGeometries) geometry.dispose();
  const hillColorAttribute = new Float32BufferAttribute(
    new Float32Array(hillGeometry.attributes.position.count * 3),
    3,
  );
  hillGeometry.setAttribute("color", hillColorAttribute);
  const hillMaterial = new MeshToonMaterial({ vertexColors: true, fog: false });
  noOutline(hillMaterial);
  const hills = new Mesh(hillGeometry, hillMaterial);
  hills.renderOrder = -9;
  group.add(hills);

  function recomputeHillColors(forPalette: WorldPalette): void {
    const horizonColor = new Color(forPalette.skyHorizon);
    const coolHaze = new Color(forPalette.skyHorizon).lerp(new Color(forPalette.skyTop), 0.35);
    const array = hillColorAttribute.array as Float32Array;
    for (const [ringIndex, ring] of hillRings.entries()) {
      const hazeTarget = horizonColor.clone().lerp(coolHaze, ring.cool);
      const col = new Color(forPalette.canopyDark).lerp(hazeTarget, ring.haze);
      const { start, count } = ringVertexRanges[ringIndex];
      for (let v = start; v < start + count; v++) {
        array[v * 3] = col.r;
        array[v * 3 + 1] = col.g;
        array[v * 3 + 2] = col.b;
      }
    }
    hillColorAttribute.needsUpdate = true;
  }
  recomputeHillColors(palette);

  // ── Clouds ──
  const cloudGeometries: BufferGeometry[] = [];
  const cloudCount = 16;
  for (let c = 0; c < cloudCount; c++) {
    const angle = (c / cloudCount) * Math.PI * 2 + stableNoise(`cloud-a:${c}`) * 1.4;
    const dist = worldRadius * (0.5 + stableNoise(`cloud-d:${c}`) * 1.1);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = worldRadius * (0.85 + stableNoise(`cloud-y:${c}`) * 0.5);
    const puffs = 3 + Math.floor(stableNoise(`cloud-p:${c}`) * 4);
    for (let p = 0; p < puffs; p++) {
      const r = 9 + stableNoise(`cloud-r:${c}:${p}`) * 11;
      const puff = new SphereGeometry(r, 10, 8);
      puff.scale(1.5, 0.55, 1.1);
      puff.translate(
        cx + (stableNoise(`cloud-px:${c}:${p}`) - 0.5) * 34,
        cy + (stableNoise(`cloud-py:${c}:${p}`) - 0.5) * 6,
        cz + (stableNoise(`cloud-pz:${c}:${p}`) - 0.5) * 22,
      );
      cloudGeometries.push(puff);
    }
  }
  const cloudGeometry = mergeGeometries(cloudGeometries);
  for (const geometry of cloudGeometries) geometry.dispose();
  const cloudMaterial = new MeshToonMaterial({ color: palette.cloud, fog: false });
  noOutline(cloudMaterial);
  const clouds = new Mesh(cloudGeometry, cloudMaterial);
  clouds.renderOrder = -9;
  const cloudSpan = worldRadius * 3.4;
  group.add(clouds);

  function update(nowSeconds: number): void {
    // Slow horizontal drift, wrapping across the sky.
    const drift = ((nowSeconds * 2.2) % cloudSpan) - cloudSpan / 2;
    clouds.position.x = drift;
  }

  function applyPalette(nextPalette: WorldPalette): void {
    ambient.color.set(nextPalette.ambient);
    ambient.intensity = nextPalette.ambientIntensity;
    hemi.color.set(nextPalette.hemiSky);
    hemi.groundColor.set(nextPalette.hemiGround);
    hemi.intensity = nextPalette.hemiIntensity;
    sun.color.set(nextPalette.sunColor);
    sun.intensity = nextPalette.sunIntensity;
    cloudMaterial.color.set(nextPalette.cloud);
  }

  function applyPaletteVertexColors(nextPalette: WorldPalette): void {
    recomputeDomeColors(nextPalette);
    recomputeHillColors(nextPalette);
  }

  function dispose(): void {
    domeGeometry.dispose();
    domeMaterial.dispose();
    hillGeometry.dispose();
    hillMaterial.dispose();
    cloudGeometry.dispose();
    cloudMaterial.dispose();
  }

  return { group, update, applyPalette, applyPaletteVertexColors, dispose };
}
