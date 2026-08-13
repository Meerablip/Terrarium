// Citizen meshes — reworked from kuku's world/agents.ts, not a port. Kuku's
// agents.ts autonomously chooses where its villagers wander (behavior
// weights, class-based work sites, wikilink visits); Terrarium's citizens
// already have real, sim-authoritative x/y/heading every snapshot, so none
// of that behavior-selection machinery applies.
//
// Phase 2: reuses agents.ts's movement-INTEGRATION primitives (capped-speed
// seek, shortest-arc heading turn — extracted into ./steering.ts, which is
// where shortestAngle/seekStep/turnStep and their tests live), but retargets
// them: instead of an autonomously-chosen waypoint, the "target" is simply
// the latest snapshot's (x, y, heading), refreshed every ~100ms by
// applyCitizens(). The capped-speed seek smooths the visual position toward
// that target every render frame via update(), replacing Phase 1's
// snap-directly-to-snapshot behavior.
//
// Deliberately NOT ported: agents.ts's citizen-vs-citizen separation pass
// (applyCollisions) — the sim already governs citizen spacing; a second
// independent renderer-side separation could visibly fight it, per the
// plan. Obstacle push-out against buildings is also skipped for the same
// "don't fight the sim's own placement" reason, left as a possible later
// nice-to-have if visual overlap turns out to look bad in practice.

import { CapsuleGeometry, ConeGeometry, Group, Mesh, type Object3D, type Raycaster } from "three";

import type { WireSnapshotV1 } from "../../shared/wireFormat.ts";
import type { WorldPalette } from "./palette.ts";
import { seekStep, turnStep } from "./steering.ts";
import { toonMaterial } from "./toon.ts";

export interface CitizensHandle {
  group: Group;
  /** Called once per incoming WireSnapshotV1 — refreshes steering targets,
   * does NOT move anything itself. */
  applyCitizens(citizens: WireSnapshotV1["citizens"]): void;
  /** Called once per animation frame — advances visual position/heading
   * toward each citizen's current target. */
  update(deltaSeconds: number): void;
  /** World-space anchor for a citizen — for camera-follow / selection,
   * mirrors kuku's engine.anchorFor(filePath). Callers read `.position`
   * treating it as world-space, which is only true because every ancestor
   * group (citizens.ts's own `group`, engine.ts's `groundLayers`/`group`)
   * currently has an identity transform. If that ever changes, callers
   * would need `.getWorldPosition()` instead of `.position` directly. */
  anchorFor(citizenId: number): Object3D | null;
  /** Raycasts against every citizen's body mesh and returns the id of the
   * closest hit, or null. Mirrors kuku's engine.pick(raycaster). */
  pick(raycaster: Raycaster): number | null;
  /** Re-tints the shared body/hat materials from a (possibly day/night-
   * blended) palette. Cheap, safe to call every frame. */
  applyPalette(palette: WorldPalette): void;
  dispose(): void;
}

const BODY_RADIUS = 1.1;
const BODY_HEIGHT = 2.4; // capsule cylinder length, excluding the hemispherical caps
const HAT_RADIUS = 1.3;
const HAT_HEIGHT = 1.4;
const GROUND_Y = BODY_HEIGHT / 2 + BODY_RADIUS;

// Sim's MOVE_SPEED is 6 world units/tick at 10Hz broadcast (~60 units/sec
// effective). Steering speed is deliberately faster (~1.75x, per the plan's
// guidance) so the visual position reliably catches up to each new
// snapshot target within the ~100ms window instead of perpetually lagging
// — a starting point for tuning once this is on screen, not a fixed value
// copied from the sim.
const STEER_SPEED = 105; // world units/sec
// Matches kuku's agents.ts TURN_SPEED — how fast heading turns to face
// targetHeading, in radians/sec-ish (see shortestAngle usage below).
const TURN_SPEED = 7;
// Below this visual speed (world units/sec), a citizen reads as standing
// still rather than walking — drives idle vs. walk animation state later
// (Phase 7 real art); for now it's tracked but only used for the walk-bob.
const WALK_SPEED_THRESHOLD = 4;

interface CitizenEntry {
  root: Object3D;
  body: Mesh;
  targetX: number;
  targetY: number;
  targetHeading: number;
  heading: number;
  walkPhase: number;
}

export function createCitizens(palette: WorldPalette): CitizensHandle {
  const group = new Group();
  const entries = new Map<number, CitizenEntry>();

  const bodyGeometry = new CapsuleGeometry(BODY_RADIUS, BODY_HEIGHT, 4, 12);
  const bodyMaterial = toonMaterial(palette, { outline: true });
  bodyMaterial.color.set(palette.wallLight);

  const hatGeometry = new ConeGeometry(HAT_RADIUS, HAT_HEIGHT, 10);
  const hatMaterial = toonMaterial(palette, { outline: true });
  hatMaterial.color.set(palette.roof);

  function createEntry(id: number, x: number, y: number, heading: number): CitizenEntry {
    const root = new Group();
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.position.y = GROUND_Y;
    const hat = new Mesh(hatGeometry, hatMaterial);
    hat.position.y = GROUND_Y + BODY_HEIGHT / 2 + BODY_RADIUS + HAT_HEIGHT / 2 - 0.3;
    root.add(body, hat);
    group.add(root);

    // Tag every part of this citizen's hierarchy with its id so a raycast
    // hit (which returns the specific mesh, e.g. `body` or `hat`) can be
    // traced back to a citizen without walking parent chains at pick time.
    root.userData.citizenId = id;
    body.userData.citizenId = id;
    hat.userData.citizenId = id;

    // First sighting: snap directly to the spawn position (no interpolation
    // lag on first sight, per the plan), heading included.
    root.position.set(x, 0, y);
    root.rotation.y = -heading;

    return { root, body, targetX: x, targetY: y, targetHeading: heading, heading, walkPhase: 0 };
  }

  function applyCitizens(citizens: WireSnapshotV1["citizens"]): void {
    const liveIds = new Set(citizens.map((c) => c.id));
    for (const [id, entry] of entries) {
      if (!liveIds.has(id)) {
        group.remove(entry.root);
        entries.delete(id);
      }
    }

    for (const citizen of citizens) {
      let entry = entries.get(citizen.id);
      if (!entry) {
        entry = createEntry(citizen.id, citizen.x, citizen.y, citizen.heading);
        entries.set(citizen.id, entry);
        continue;
      }
      // Refresh the steering target only — update() moves the visual
      // transform toward it over subsequent frames.
      entry.targetX = citizen.x;
      entry.targetY = citizen.y;
      entry.targetHeading = citizen.heading;
    }
  }

  function update(deltaSeconds: number): void {
    for (const entry of entries.values()) {
      const seek = seekStep(
        entry.root.position.x,
        entry.root.position.z,
        entry.targetX,
        entry.targetY,
        STEER_SPEED,
        deltaSeconds,
      );
      entry.root.position.x = seek.x;
      entry.root.position.z = seek.y;
      const visualSpeed = seek.distanceMoved / Math.max(deltaSeconds, 1e-6);

      // Heading turns toward the snapshot's targetHeading directly (not
      // re-derived from movement direction, unlike kuku's agents.ts —
      // Terrarium's citizens already have an authoritative heading from
      // the sim, so there's nothing to derive), via shortest-arc turn.
      entry.heading = turnStep(entry.heading, entry.targetHeading, TURN_SPEED, deltaSeconds);
      entry.root.rotation.y = -entry.heading;

      // Purely cosmetic walk-bob while visually moving; idle/walk clip
      // selection proper is a Phase 7 (real art) concern.
      if (visualSpeed > WALK_SPEED_THRESHOLD) {
        entry.walkPhase += deltaSeconds * 9;
        entry.body.position.y = GROUND_Y + Math.sin(entry.walkPhase) * 0.06;
      } else {
        entry.body.position.y = GROUND_Y;
      }
    }
  }

  function anchorFor(citizenId: number): Object3D | null {
    return entries.get(citizenId)?.root ?? null;
  }

  function pick(raycaster: Raycaster): number | null {
    let closestId: number | null = null;
    let minDistance = Infinity;
    for (const [id, entry] of entries) {
      // Raycasting reads each object's matrixWorld, which three.js only
      // recomputes automatically inside Scene.updateMatrixWorld() (in turn
      // called by WebGLRenderer.render()). A click handler can fire between
      // applySnapshot()/update() moving a citizen and the next render call,
      // so relying on render-loop timing here would be a real, if rare,
      // stale-matrix bug — update explicitly instead of assuming freshness.
      entry.root.updateMatrixWorld(true);
      const intersects = raycaster.intersectObject(entry.root, true);
      if (intersects.length > 0) {
        const dist = intersects[0].distance;
        if (dist < minDistance) {
          minDistance = dist;
          closestId = id;
        }
      }
    }
    return closestId;
  }

  function applyPalette(nextPalette: WorldPalette): void {
    bodyMaterial.color.set(nextPalette.wallLight);
    hatMaterial.color.set(nextPalette.roof);
  }

  function dispose(): void {
    bodyGeometry.dispose();
    bodyMaterial.dispose();
    hatGeometry.dispose();
    hatMaterial.dispose();
  }

  return { group, applyCitizens, update, anchorFor, pick, applyPalette, dispose };
}
