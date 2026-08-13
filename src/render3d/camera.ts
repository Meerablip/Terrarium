// Camera + orbit/pan/zoom controls — replaces render/viewportSetup.ts
// (pixi-viewport's drag/pinch/wheel/clampZoom/clamp). Bird's-eye polar-angle
// clamp and initial framing mirror kuku's voxel_canvas.tsx camera setup
// (apps/desktop/src/plugins/builtin/voxel_graph/voxel_canvas.tsx); the
// pan-bounds wrapper is net-new — OrbitControls has no built-in pan-clamp
// equivalent to pixi-viewport's clamp({direction: "all"}).

import { MOUSE, PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Matches kuku's bird's-eye framing clamp (voxel_canvas.tsx: MIN_POLAR/MAX_POLAR).
const MIN_POLAR = Math.PI * 0.18;
const MAX_POLAR = Math.PI * 0.33;

// kuku starts the camera at a fixed isometric-ish direction, scaled by a
// distance tuned for its (larger, note-count-driven) worlds. Terrarium's
// world is a fixed 1600x1600 units (GRID_COLS*CELL_SIZE), so the constant
// below is a Phase-1 starting point, not a direct port of kuku's number —
// expect to retune once something is actually on screen.
const ISO_DIRECTION = new Vector3(1, 1.05, 1).normalize();

export interface Render3DCamera {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** Frames the camera to view a world of the given radius (world units),
   * centered at (centerX, centerZ) — mirrors today's
   * `viewport.moveCenter(worldWidth/2, worldHeight/2)` startup behavior. */
  frame(centerX: number, centerZ: number, worldRadius: number): void;
  dispose(): void;
}

export function createRender3DCamera(
  canvas: HTMLCanvasElement,
  worldWidth: number,
  worldHeight: number,
): Render3DCamera {
  const camera = new PerspectiveCamera(50, 1, 4, 8_000);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.minPolarAngle = MIN_POLAR;
  controls.maxPolarAngle = MAX_POLAR;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  // Left drag orbits, middle or right drag pans — same as kuku's mapping.
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };

  // Zoom-equivalent bounds (pixi-viewport's clampZoom({minScale, maxScale})).
  // world diagonal ~2263 units (1600*sqrt(2)); bounds chosen so the closest
  // zoom reads roughly street-level and the farthest still frames the whole
  // grid with margin. Starting point for Phase 1 tuning.
  const worldDiagonal = Math.hypot(worldWidth, worldHeight);
  controls.minDistance = 40;
  controls.maxDistance = worldDiagonal * 1.6;

  // Pan-clamp: keep the orbit target inside the world bounds plus a little
  // margin, since OrbitControls (unlike pixi-viewport) has no built-in pan
  // bounds. Re-checked on every "change" event, same trigger kuku uses for
  // its own per-frame zoom-readout update.
  const margin = Math.max(worldWidth, worldHeight) * 0.15;
  const minX = -margin;
  const maxX = worldWidth + margin;
  const minZ = -margin;
  const maxZ = worldHeight + margin;
  controls.addEventListener("change", () => {
    const t = controls.target;
    const clampedX = Math.min(maxX, Math.max(minX, t.x));
    const clampedZ = Math.min(maxZ, Math.max(minZ, t.z));
    if (clampedX !== t.x || clampedZ !== t.z) {
      const dx = clampedX - t.x;
      const dz = clampedZ - t.z;
      t.x = clampedX;
      t.z = clampedZ;
      camera.position.x += dx;
      camera.position.z += dz;
    }
  });

  function frame(centerX: number, centerZ: number, worldRadius: number): void {
    controls.target.set(centerX, 0, centerZ);
    // Deliberately well inside worldRadius (which also sizes the sky's hill
    // backdrop at 1.42x-2.6x that same radius, see world/sky.ts) so the
    // camera looks down and across the terrain with hills receding beyond
    // it, rather than sitting among the first hill ring.
    const distance = Math.max(controls.minDistance, worldRadius * 0.85);
    camera.position.copy(ISO_DIRECTION).multiplyScalar(distance).add(controls.target);
    controls.update();
  }

  function dispose(): void {
    controls.dispose();
  }

  return { camera, controls, frame, dispose };
}
