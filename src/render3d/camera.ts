// Camera + orbit/pan/zoom controls — replaces render/viewportSetup.ts
// (pixi-viewport's drag/pinch/wheel/clampZoom/clamp). Bird's-eye polar-angle
// clamp and initial framing mirror kuku's voxel_canvas.tsx camera setup
// (apps/desktop/src/plugins/builtin/voxel_graph/voxel_canvas.tsx); the
// pan-bounds wrapper is net-new — OrbitControls has no built-in pan-clamp
// equivalent to pixi-viewport's clamp({direction: "all"}).

import { MOUSE, PerspectiveCamera, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Matches kuku's bird's-eye framing clamp (voxel_canvas.tsx: MIN_POLAR/MAX_POLAR).
const MIN_POLAR = Math.PI * 0.18;
const MAX_POLAR = Math.PI * 0.33;

const ISO_DIRECTION = new Vector3(1, 1.05, 1).normalize();

export interface Render3DCamera {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** Frames the camera to view a world of the given radius (world units),
   * centered at (centerX, centerZ). */
  frame(centerX: number, centerZ: number, worldRadius: number): void;
  /** Advances keyboard/touch/scroll navigation smooth movements per frame. */
  update(deltaSeconds: number): void;
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

  // Mouse: Left drag orbits, middle or right drag pans
  controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN };

  // Touch: Single finger orbits, two fingers pinch-zoom and pan
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

  const worldDiagonal = Math.hypot(worldWidth, worldHeight);
  controls.minDistance = 40;
  controls.maxDistance = worldDiagonal * 1.6;

  // Pan-clamp: keep the orbit target inside the world bounds plus margin
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

  // Track active pressed keys for continuous keyboard movement
  const keysPressed = new Set<string>();

  function onKeyDown(e: KeyboardEvent): void {
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
    keysPressed.add(e.code);
    keysPressed.add(e.key);
  }

  function onKeyUp(e: KeyboardEvent): void {
    keysPressed.delete(e.code);
    keysPressed.delete(e.key);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function frame(centerX: number, centerZ: number, worldRadius: number): void {
    controls.target.set(centerX, 0, centerZ);
    const distance = Math.max(controls.minDistance, worldRadius * 0.85);
    camera.position.copy(ISO_DIRECTION).multiplyScalar(distance).add(controls.target);
    controls.update();
  }

  const forwardScratch = new Vector3();
  const rightScratch = new Vector3();
  const moveVector = new Vector3();

  function update(deltaSeconds: number): void {
    if (keysPressed.size === 0) return;

    const distance = camera.position.distanceTo(controls.target);
    // Pan speed scales with distance so keyboard movement feels natural at any zoom
    const panSpeed = Math.max(120, distance * 0.85) * deltaSeconds;

    forwardScratch.set(
      controls.target.x - camera.position.x,
      0,
      controls.target.z - camera.position.z,
    );
    if (forwardScratch.lengthSq() > 0.0001) {
      forwardScratch.normalize();
    }
    rightScratch.crossVectors(forwardScratch, new Vector3(0, 1, 0)).normalize();

    moveVector.set(0, 0, 0);

    // Forward (^, ArrowUp, W) / Backward (v, ArrowDown, S)
    if (keysPressed.has("ArrowUp") || keysPressed.has("KeyW") || keysPressed.has("^")) {
      moveVector.addScaledVector(forwardScratch, panSpeed);
    }
    if (keysPressed.has("ArrowDown") || keysPressed.has("KeyS") || keysPressed.has("v")) {
      moveVector.addScaledVector(forwardScratch, -panSpeed);
    }

    // Left (<, ArrowLeft, A, ,) / Right (>, ArrowRight, D, .)
    if (keysPressed.has("ArrowLeft") || keysPressed.has("KeyA") || keysPressed.has("<") || keysPressed.has(",")) {
      moveVector.addScaledVector(rightScratch, -panSpeed);
    }
    if (keysPressed.has("ArrowRight") || keysPressed.has("KeyD") || keysPressed.has(">") || keysPressed.has(".")) {
      moveVector.addScaledVector(rightScratch, panSpeed);
    }

    if (moveVector.lengthSq() > 0) {
      controls.target.add(moveVector);
      camera.position.add(moveVector);
    }

    // Zoom In (+, PageUp, E) / Zoom Out (-, PageDown, Q)
    const zoomSpeed = Math.max(150, distance * 1.2) * deltaSeconds;
    if (
      keysPressed.has("Equal") ||
      keysPressed.has("+") ||
      keysPressed.has("NumpadAdd") ||
      keysPressed.has("PageUp") ||
      keysPressed.has("KeyE")
    ) {
      const newDist = Math.max(controls.minDistance, distance - zoomSpeed);
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, newDist);
    }

    if (
      keysPressed.has("Minus") ||
      keysPressed.has("-") ||
      keysPressed.has("NumpadSubtract") ||
      keysPressed.has("PageDown") ||
      keysPressed.has("KeyQ")
    ) {
      const newDist = Math.min(controls.maxDistance, distance + zoomSpeed);
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, newDist);
    }
  }

  function dispose(): void {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    controls.dispose();
  }

  return { camera, controls, frame, update, dispose };
}

