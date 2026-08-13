// Ported near-verbatim from kuku (github.com/kuku-mom/kuku), MIT License —
// see /THIRD_PARTY_NOTICES.md. Original:
// apps/desktop/src/plugins/builtin/voxel_graph/world/toon.ts
//
// ── Cel-shading toolkit ──
//
// Shared building blocks for the painterly look: a banded toon material whose
// lighting falls into a few flat steps, and helpers to control the ink outline
// drawn by three's OutlineEffect (which reads material.userData.outlineParameters).
//
// Night-mode note: the gradient ramp below ([150,205,255]) is a fixed
// lighting-quantization curve, NOT palette-dependent — it never reads
// `palette` at all, so there's no per-mood cache-thrash concern for it
// specifically (contrary to what the implementation plan's Phase 4 section
// assumed before this code was actually re-read here). What IS
// palette-dependent and baked once per material is
// `outlineParameters.color` (from `palette.ink`) — day and night inks are
// both near-black (#2c2a26 vs #15141a), so Phase 4 leaves per-material
// outline color un-updated on a mood blend as a deliberate, low-value-to-fix
// simplification rather than walking every material in every world module
// for a barely-visible difference. The genuinely expensive per-frame-vs-
// coarser-cadence tradeoff this plan flagged turned out to live in
// sky.ts's dome/hills vertex-color buffers instead — see
// SkyHandle.applyPaletteVertexColors.

import { DataTexture, MeshToonMaterial, NearestFilter, RedFormat } from "three";

import type { WorldPalette } from "./palette.ts";

let gradientCache: DataTexture | null = null;

/** A 3-step grayscale ramp → cel shading that still reads 3D form, not flat. */
function toonGradient(): DataTexture {
  if (gradientCache) return gradientCache;
  const steps = new Uint8Array([150, 205, 255]);
  const texture = new DataTexture(steps, steps.length, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientCache = texture;
  return texture;
}

export interface ToonOptions {
  /** Drawn by the ink outline pass (default true). */
  outline?: boolean;
  /** Per-material outline thickness override. */
  outlineThickness?: number;
  /** Transparency for soft props (foam, water lines). */
  opacity?: number;
  /** Use the geometry's per-vertex color attribute (for painterly terrain). */
  vertexColors?: boolean;
}

const DEFAULT_THICKNESS = 0.0045;

/**
 * Cel-shaded material. Base color stays white so per-instance `instanceColor`
 * (or a child mesh's color) tints it. Lighting is quantised by the gradient map.
 */
export function toonMaterial(palette: WorldPalette, options: ToonOptions = {}): MeshToonMaterial {
  const material = new MeshToonMaterial({
    color: "#ffffff",
    gradientMap: toonGradient(),
    vertexColors: options.vertexColors ?? false,
    transparent: options.opacity !== undefined && options.opacity < 1,
    opacity: options.opacity ?? 1,
  });
  if (options.outline === false) {
    noOutline(material);
  } else {
    material.userData.outlineParameters = {
      thickness: options.outlineThickness ?? DEFAULT_THICKNESS,
      color: hexToRgbArray(palette.ink),
      alpha: 1,
      visible: true,
      keepAlive: false,
    };
  }
  return material;
}

/** Marks a material so the ink outline pass skips it (water, sky, clouds). */
export function noOutline(material: { userData: Record<string, unknown> }): void {
  material.userData.outlineParameters = { visible: false };
}

/** The shared banded gradient map, for cel-shading loaded meshes (e.g. the GLB character). */
export function getToonGradient(): DataTexture {
  return toonGradient();
}

/** Standard ink-outline params for a material the outline pass should draw. */
export function inkOutline(
  palette: WorldPalette,
  thickness = DEFAULT_THICKNESS,
): Record<string, unknown> {
  return {
    thickness,
    color: hexToRgbArray(palette.ink),
    alpha: 1,
    visible: true,
    keepAlive: false,
  };
}

function hexToRgbArray(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const int = Number.parseInt(value, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

export function disposeToonGradient(): void {
  gradientCache?.dispose();
  gradientCache = null;
}
