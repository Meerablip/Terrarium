import { describe, expect, it } from "vitest";
import { seekStep, shortestAngle, turnStep } from "../../src/render3d/world/steering.ts";

describe("seekStep", () => {
  it("moves toward the target by at most speed * deltaSeconds, without overshooting", () => {
    const result = seekStep(0, 0, 100, 0, 10, 1); // 10 units/sec * 1s = 10 units of travel
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.arrived).toBe(false);
    expect(result.distanceMoved).toBeCloseTo(10, 6);
  });

  it("snaps exactly onto the target once within one step's distance, never overshooting", () => {
    const result = seekStep(0, 0, 5, 0, 10, 1); // step (10) > remaining distance (5)
    expect(result.x).toBeCloseTo(5, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.arrived).toBe(true);
    expect(result.distanceMoved).toBeCloseTo(5, 6);
  });

  it("moves proportionally along a diagonal, not axis-aligned", () => {
    const result = seekStep(0, 0, 10, 10, 10, 1); // distance ~14.14, step 10
    const distance = Math.hypot(result.x, result.y);
    expect(distance).toBeCloseTo(10, 6);
    // Direction preserved: still on the line y = x.
    expect(result.x).toBeCloseTo(result.y, 6);
  });

  it("reports arrived when already exactly at the target", () => {
    const result = seekStep(3, 4, 3, 4, 10, 1);
    expect(result.arrived).toBe(true);
    expect(result.distanceMoved).toBe(0);
  });

  it("self-corrects smoothly when the target moves before the previous one was reached — no overshoot, no discontinuity", () => {
    // Simulates a citizen mid-seek toward an old snapshot target when a new,
    // different snapshot target arrives (network jitter case from the plan).
    let x = 0;
    let y = 0;
    let result = seekStep(x, y, 100, 0, 10, 0.5); // step 5, distance 100 -> not arrived
    x = result.x;
    y = result.y;
    expect(result.arrived).toBe(false);

    // New target arrives before the old one was reached.
    result = seekStep(x, y, 0, 100, 10, 0.5);
    // Should move toward the NEW target from wherever it currently is, not
    // jump or ignore the update.
    expect(result.distanceMoved).toBeCloseTo(5, 6);
    expect(result.y).toBeGreaterThan(0); // moved toward the new target's +y
  });
});

describe("shortestAngle", () => {
  it("returns a small positive delta for a small forward turn", () => {
    expect(shortestAngle(0, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("returns a small negative delta for a small backward turn", () => {
    expect(shortestAngle(0.5, 0)).toBeCloseTo(-0.5, 6);
  });

  it("takes the short way around the -PI/PI wraparound instead of the long way", () => {
    // From just past +PI to just past -PI is a tiny turn the short way
    // (through PI), not a near-full-circle turn the long way (through 0).
    const delta = shortestAngle(3.1, -3.1);
    expect(Math.abs(delta)).toBeLessThan(0.2);
  });

  it("handles a full half-turn (PI) without ambiguity blowing up", () => {
    const delta = shortestAngle(0, Math.PI);
    expect(Math.abs(delta)).toBeCloseTo(Math.PI, 6);
  });
});

describe("turnStep", () => {
  it("turns toward the target heading, capped by turnSpeed * deltaSeconds", () => {
    // shortestAngle(0, 1) = 1; turnSpeed*dt = 7*0.1 = 0.7 (< 1), so capped.
    const next = turnStep(0, 1, 7, 0.1);
    expect(next).toBeCloseTo(0.7, 6);
  });

  it("reaches the target heading directly once turnSpeed * deltaSeconds >= 1", () => {
    const next = turnStep(0, 1, 7, 1); // turnSpeed*dt = 7, min(1, 7) = 1 -> full delta applied
    expect(next).toBeCloseTo(1, 6);
  });

  it("turns the short way across the -PI/PI wraparound, not the long way", () => {
    const next = turnStep(3.1, -3.1, 7, 1); // full-strength turn, should land near the short-arc target
    // shortestAngle(3.1, -3.1) is small and positive (wraps through PI);
    // landing near -3.1 by wrapping is equivalent to landing near +PI from
    // the short side, not swinging all the way through 0.
    const delta = shortestAngle(3.1, next);
    expect(Math.abs(delta)).toBeLessThan(0.2);
  });
});
