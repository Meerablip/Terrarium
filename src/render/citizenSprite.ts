// Builds a single citizen triangle. Geometry is drawn once and never
// redrawn — only its Container transform (position/rotation) changes per
// tick, which is far cheaper than reissuing Graphics path commands for
// hundreds of entities every tick.

import { Graphics } from "pixi.js";
import { CELL_SIZE } from "../sim/constants.ts";
import { INK_COLOR } from "./colors.ts";

// Triangle sized relative to the terrain cell so it reads clearly without
// dominating the terrain texture at default zoom.
const TRIANGLE_LENGTH = CELL_SIZE * 0.6;
const TRIANGLE_HALF_WIDTH = CELL_SIZE * 0.28;

export function createTriangle(): Graphics {
  const g = new Graphics();

  // Isoceles triangle centered on its own origin, pointing along local +x,
  // so `rotation = heading` (radians, 0 = facing +x) needs no extra offset.
  g.moveTo(TRIANGLE_LENGTH * 0.6, 0)
    .lineTo(-TRIANGLE_LENGTH * 0.4, TRIANGLE_HALF_WIDTH)
    .lineTo(-TRIANGLE_LENGTH * 0.4, -TRIANGLE_HALF_WIDTH)
    .closePath()
    .fill(INK_COLOR);

  // Pixi 8's federated event system: eventMode replaces the old `interactive`
  // boolean. Hit-testing uses the Graphics' own fill bounds — sufficient at
  // this small triangle size, no custom hitArea needed.
  g.eventMode = "static";
  g.cursor = "pointer";

  return g;
}
