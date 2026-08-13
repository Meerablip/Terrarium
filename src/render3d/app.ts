// Renderer/scene bootstrap — replaces render/app.ts (Pixi Application
// bootstrap). WebGLRenderer + PainterlyRenderer setup here mirrors kuku's
// voxel_canvas.tsx onMount block (apps/desktop/src/plugins/builtin/
// voxel_graph/voxel_canvas.tsx), translated out of SolidJS into plain
// functions — same renderer options, same painterly wrap, same resize
// handling, no framework dependency.

import { Color, Scene, WebGLRenderer } from "three";

import { PainterlyRenderer } from "./world/postfx.ts";

export interface Render3DApp {
  renderer: WebGLRenderer;
  painterly: PainterlyRenderer;
  scene: Scene;
  canvas: HTMLCanvasElement;
  /** Call once per animation frame after updating the scene. */
  render(camera: Parameters<PainterlyRenderer["render"]>[1]): void;
  dispose(): void;
}

// Matches kuku's ink color passed to PainterlyRenderer's outline pass
// (voxel_canvas.tsx: `new PainterlyRenderer(renderer, [0.13, 0.12, 0.1])`).
const INK_COLOR: [number, number, number] = [0.13, 0.12, 0.1];

export function createRender3DApp(parent: HTMLElement, initialBackground: string): Render3DApp {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = "srgb";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const painterly = new PainterlyRenderer(renderer, INK_COLOR);

  const scene = new Scene();
  // Match the sky before the first world build so loading never flashes
  // black — same reasoning as kuku's own initial scene.background set.
  scene.background = new Color(initialBackground);

  parent.appendChild(renderer.domElement);

  function resize(): void {
    const { clientWidth, clientHeight } = parent;
    if (clientWidth === 0 || clientHeight === 0) return;
    painterly.setSize(clientWidth, clientHeight);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(parent);
  resize();

  function render(camera: Parameters<PainterlyRenderer["render"]>[1]): void {
    painterly.render(scene, camera);
  }

  function dispose(): void {
    resizeObserver.disconnect();
    painterly.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === parent) {
      parent.removeChild(renderer.domElement);
    }
  }

  return { renderer, painterly, scene, canvas: renderer.domElement, render, dispose };
}
