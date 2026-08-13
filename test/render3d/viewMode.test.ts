import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getViewMode, MAP_VIEW_DISTANCE_THRESHOLD, onViewModeChange } from "../../src/render3d/viewMode.ts";

// A minimal stand-in for OrbitControls — getViewMode/onViewModeChange only
// ever read `.target` and call `.addEventListener("change", ...)`, neither
// of which needs a real canvas/WebGL context, so a plain object satisfies
// the shape without pulling in the real three/examples/jsm class. Cast
// through `unknown` at the call site since this intentionally implements
// only the slice of OrbitControls' interface these functions actually use.
function fakeControls(targetX = 0, targetY = 0, targetZ = 0) {
  const listeners: Array<() => void> = [];
  return {
    target: new Vector3(targetX, targetY, targetZ),
    addEventListener(_event: string, cb: () => void) {
      listeners.push(cb);
    },
    fireChange() {
      for (const cb of listeners) cb();
    },
  };
}

function asControls(fake: ReturnType<typeof fakeControls>): OrbitControls {
  return fake as unknown as OrbitControls;
}

describe("getViewMode", () => {
  it("reads 'ground' when the camera is closer than the threshold", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, MAP_VIEW_DISTANCE_THRESHOLD - 100);
    expect(getViewMode(camera, asControls(fakeControls()))).toBe("ground");
  });

  it("reads 'map' when the camera is farther than the threshold", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, MAP_VIEW_DISTANCE_THRESHOLD + 100);
    expect(getViewMode(camera, asControls(fakeControls()))).toBe("map");
  });

  it("measures distance from controls.target, not the world origin", () => {
    const camera = new PerspectiveCamera();
    // Camera is close to a non-origin target -> should read "ground" even
    // though its distance from (0,0,0) would exceed the threshold.
    camera.position.set(5000, 0, 5000);
    const controls = fakeControls(5000, 0, 5000 - 50);
    expect(getViewMode(camera, asControls(controls))).toBe("ground");
  });
});

describe("onViewModeChange", () => {
  it("invokes the callback once immediately with the current mode", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const controls = fakeControls();
    const seen: string[] = [];
    onViewModeChange(camera, asControls(controls), (mode) => seen.push(mode));
    expect(seen).toEqual(["ground"]);
  });

  it("does NOT re-invoke the callback on a change event that doesn't flip the mode", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10); // well within "ground"
    const controls = fakeControls();
    const seen: string[] = [];
    onViewModeChange(camera, asControls(controls), (mode) => seen.push(mode));

    camera.position.set(0, 0, 20); // still "ground"
    controls.fireChange();
    expect(seen).toEqual(["ground"]); // no second call
  });

  it("invokes the callback again only when the mode actually flips", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 10); // "ground"
    const controls = fakeControls();
    const seen: string[] = [];
    onViewModeChange(camera, asControls(controls), (mode) => seen.push(mode));

    camera.position.set(0, 0, MAP_VIEW_DISTANCE_THRESHOLD + 500); // -> "map"
    controls.fireChange();
    expect(seen).toEqual(["ground", "map"]);

    camera.position.set(0, 0, 10); // back to "ground"
    controls.fireChange();
    expect(seen).toEqual(["ground", "map", "ground"]);
  });
});
