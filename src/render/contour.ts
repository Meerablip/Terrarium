// Boundary extraction + smoothing for a binary cell mask. Used to render a
// pond as a smooth vector shape instead of a blocky 16px-grid tile mosaic —
// see terrainLayer.ts.
//
// Pure logic, no Pixi types — unit-testable without a renderer.
//
// Known sharp edge: traceBoundary walks whole-cell edges, not sub-cell
// marching squares, so it doesn't resolve the classic diagonal-touching
// ambiguity (two "inside" cells meeting only at a shared corner, with the
// two diagonal neighbours both "outside"). At that corner, four boundary
// edges meet and the greedy chain in traceBoundary can pick the wrong one,
// splicing what should be two separate loops into one self-crossing mess —
// verified as a real failure mode with a hand-built test shape with a large
// wobble amplitude, though every seed tested against the actual
// generatePonds output (sim/terrain.ts) traced cleanly. POND_EDGE_JITTER
// relative to POND_RADIUS_CELLS is what keeps the boundary from folding back
// on itself; raise jitter (or add a second, larger pond) without retesting
// a handful of seeds at your peril.

export interface Point {
  x: number;
  y: number;
}

/**
 * Traces the boundary of `isInside` as closed loops of grid-corner points
 * (a rectilinear, stair-stepped outline — smoothClosedPolygon is what turns
 * it into a curve). Works by collecting one boundary edge per inside-cell
 * side that borders an outside cell, then chaining those edges tip-to-tail
 * into loops.
 *
 * Assumes simple, hole-free blobs (true for both a pond and the union of
 * home-clearing circles — neither ever has a "donut" interior), so a loop
 * that fails to close back to its start is silently dropped rather than
 * handled as a general polygon-with-holes case.
 */
export function traceBoundary(
  isInside: (cx: number, cy: number) => boolean,
  cols: number,
  rows: number,
): Point[][] {
  const inside = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < cols && cy < rows && isInside(cx, cy);
  const cornerIndex = (cx: number, cy: number): number => cy * (cols + 1) + cx;

  // Each edge is wound so the inside cell is on its right, which is what
  // makes tip-to-tail chaining below produce consistently-oriented loops.
  const from: number[] = [];
  const to: number[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (!inside(cx, cy)) continue;
      if (!inside(cx, cy - 1)) {
        from.push(cornerIndex(cx, cy));
        to.push(cornerIndex(cx + 1, cy));
      }
      if (!inside(cx + 1, cy)) {
        from.push(cornerIndex(cx + 1, cy));
        to.push(cornerIndex(cx + 1, cy + 1));
      }
      if (!inside(cx, cy + 1)) {
        from.push(cornerIndex(cx + 1, cy + 1));
        to.push(cornerIndex(cx, cy + 1));
      }
      if (!inside(cx - 1, cy)) {
        from.push(cornerIndex(cx, cy + 1));
        to.push(cornerIndex(cx, cy));
      }
    }
  }

  const byFrom = new Map<number, number[]>(); // corner -> indices into from/to
  for (let i = 0; i < from.length; i++) {
    const list = byFrom.get(from[i]);
    if (list) list.push(i);
    else byFrom.set(from[i], [i]);
  }

  const used = new Uint8Array(from.length);
  const loops: Point[][] = [];

  for (let start = 0; start < from.length; start++) {
    if (used[start]) continue;
    const loopCorners: number[] = [from[start]];
    let current = start;
    used[current] = 1;

    while (to[current] !== from[start]) {
      const candidates = byFrom.get(to[current]);
      const next = candidates?.find((i) => !used[i]);
      if (next === undefined) break; // malformed — drop this loop below
      loopCorners.push(to[current]);
      used[next] = 1;
      current = next;
    }

    if (to[current] === from[start] && loopCorners.length >= 3) {
      loops.push(loopCorners.map((idx) => ({ x: idx % (cols + 1), y: (idx / (cols + 1)) | 0 })));
    }
  }

  return loops;
}

/**
 * Chaikin corner-cutting subdivision, treating `points` as a closed loop.
 * Each iteration replaces every edge with two points 1/4 and 3/4 along it,
 * which is the standard cheap way to turn a stair-stepped outline into a
 * smooth rounded curve without needing a real spline library.
 */
export function smoothClosedPolygon(points: Point[], iterations: number): Point[] {
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      next.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 });
      next.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 });
    }
    pts = next;
  }
  return pts;
}

/** Scales a closed loop outward from its own centroid by `factor` — a cheap
 * stand-in for a true polygon offset (Minkowski sum), good enough for a
 * soft decorative "fringe" halo where exact uniform width doesn't matter. */
export function expandFromCentroid(points: Point[], factor: number): Point[] {
  const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  centroid.x /= points.length;
  centroid.y /= points.length;
  return points.map((p) => ({
    x: centroid.x + (p.x - centroid.x) * factor,
    y: centroid.y + (p.y - centroid.y) * factor,
  }));
}
