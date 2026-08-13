import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { createCitizens } from "../../src/render3d/world/citizens.ts";
import { paletteForMood } from "../../src/render3d/world/palette.ts";

const palette = paletteForMood("day");

// Raycasting against real geometry is pure CPU-side math (no GPU/WebGL
// needed, unlike rendering a frame) — this exercises createCitizens' real
// three.js Mesh/Raycaster machinery directly, not a mock, which is why it
// lives here as an integration-style test rather than pure-logic-only like
// steering.test.ts/viewMode.test.ts.

function makeCamera(x: number, y: number, z: number, lookAtX: number, lookAtY: number, lookAtZ: number) {
  const camera = new PerspectiveCamera(50, 1, 0.1, 10000);
  camera.position.set(x, y, z);
  camera.lookAt(new Vector3(lookAtX, lookAtY, lookAtZ));
  camera.updateMatrixWorld();
  return camera;
}

describe("createCitizens: applyCitizens + pick + anchorFor", () => {
  it("spawns a citizen at its snapshot position, and a straight-down raycast from above hits it", () => {
    const citizens = createCitizens(palette);
    citizens.applyCitizens([{ id: 1, x: 100, y: 100, heading: 0, resource: 50, age: 10 }]);

    const camera = makeCamera(100, 200, 100, 100, 0, 100); // directly above citizen 1, looking straight down
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera); // NDC center = straight down the camera's forward axis

    const hitId = citizens.pick(raycaster);
    expect(hitId).toBe(1);

    citizens.dispose();
  });

  it("returns null when the raycast doesn't hit any citizen", () => {
    const citizens = createCitizens(palette);
    citizens.applyCitizens([{ id: 1, x: 100, y: 100, heading: 0, resource: 50, age: 10 }]);

    // Aim far away from the citizen.
    const camera = makeCamera(5000, 200, 5000, 5000, 0, 5000);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);

    expect(citizens.pick(raycaster)).toBeNull();

    citizens.dispose();
  });

  it("picks the closest citizen to the camera when a ray grazes two of them", () => {
    const citizens = createCitizens(palette);
    // Two citizens spaced 1.5 units apart in x — close enough that a single
    // near-horizontal ray from the side clips both capsules (each ~1.1
    // radius), but citizen 1 sits nearer the camera's origin along the
    // ray, so it should win over citizen 2 despite both being hit.
    citizens.applyCitizens([
      { id: 1, x: 100, y: 100, heading: 0, resource: 50, age: 10 },
      { id: 2, x: 101.5, y: 100, heading: 0, resource: 50, age: 10 },
    ]);
    // Camera to the side, at citizen-body height, looking down the +x axis
    // so the ray passes through citizen 1 first, then citizen 2.
    const camera = makeCamera(90, 3.5, 100, 200, 3.5, 100);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);

    expect(citizens.pick(raycaster)).toBe(1);

    citizens.dispose();
  });

  it("anchorFor returns the live position of a spawned citizen, and null for an unknown id", () => {
    const citizens = createCitizens(palette);
    citizens.applyCitizens([{ id: 7, x: 42, y: 84, heading: 0, resource: 50, age: 10 }]);

    const anchor = citizens.anchorFor(7);
    expect(anchor).not.toBeNull();
    expect(anchor!.position.x).toBeCloseTo(42, 6);
    expect(anchor!.position.z).toBeCloseTo(84, 6); // world y -> three.js z

    expect(citizens.anchorFor(999)).toBeNull();

    citizens.dispose();
  });

  it("despawns a citizen no longer present in the snapshot — pick/anchorFor stop finding it", () => {
    const citizens = createCitizens(palette);
    citizens.applyCitizens([{ id: 1, x: 100, y: 100, heading: 0, resource: 50, age: 10 }]);
    expect(citizens.anchorFor(1)).not.toBeNull();

    citizens.applyCitizens([]); // citizen 1 died / left the snapshot
    expect(citizens.anchorFor(1)).toBeNull();

    citizens.dispose();
  });
});
