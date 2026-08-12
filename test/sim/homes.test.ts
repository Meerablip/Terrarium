import { describe, expect, it } from "vitest";
import { HOME_COMPLETE_THRESHOLD } from "../../src/sim/constants.ts";
import { applyHomeEvents, createHomeRegistry, type HomeEvent } from "../../src/sim/homes.ts";
import { createCitizenStore, killAtSlot, spawnCitizen } from "../../src/sim/ecs/store.ts";

describe("homes", () => {
  it("founds a new home on first deposit at an unoccupied spot", () => {
    const homes = createHomeRegistry();
    const citizens = createCitizenStore(4);
    const citizenId = spawnCitizen(citizens, 50, 50, 0, 10);

    const events: HomeEvent[] = [{ kind: "deposit", citizenId, x: 50, y: 50, amount: 20 }];
    applyHomeEvents(homes, citizens, events);

    expect(homes.homes.size).toBe(1);
    const home = [...homes.homes.values()][0];
    expect(home.buildProgress).toBe(20);
    expect(home.complete).toBe(false);
    expect(home.memberIds.has(citizenId)).toBe(true);

    const slot = citizens.idToSlot.get(citizenId)!;
    expect(citizens.hasHome[slot]).toBe(1);
    expect(citizens.homeId[slot]).toBe(home.id);
  });

  it("completes exactly once when buildProgress crosses HOME_COMPLETE_THRESHOLD", () => {
    const homes = createHomeRegistry();
    const citizens = createCitizenStore(4);
    const citizenId = spawnCitizen(citizens, 0, 0, 0, 10);

    let completedTransitions = 0;
    let wasComplete = false;
    for (let i = 0; i < 10; i++) {
      applyHomeEvents(homes, citizens, [{ kind: "deposit", citizenId, x: 0, y: 0, amount: HOME_COMPLETE_THRESHOLD / 5 }]);
      const home = [...homes.homes.values()][0];
      if (home.complete && !wasComplete) completedTransitions++;
      wasComplete = home.complete;
    }

    expect(completedTransitions).toBe(1);
    expect(wasComplete).toBe(true);
  });

  it("shares one home across multiple citizens depositing at the same spot", () => {
    const homes = createHomeRegistry();
    const citizens = createCitizenStore(4);
    const a = spawnCitizen(citizens, 10, 10, 0, 10);
    const b = spawnCitizen(citizens, 12, 11, 0, 10);

    applyHomeEvents(homes, citizens, [
      { kind: "deposit", citizenId: a, x: 10, y: 10, amount: 15 },
      { kind: "deposit", citizenId: b, x: 12, y: 11, amount: 15 }, // within HOME_ATTACH_RADIUS of the first
    ]);

    expect(homes.homes.size).toBe(1);
    const home = [...homes.homes.values()][0];
    expect(home.memberIds.size).toBe(2);
    expect(home.buildProgress).toBe(30);
  });

  it("keeps the HomeRecord alive after a member dies, removing it from memberIds only", () => {
    const homes = createHomeRegistry();
    const citizens = createCitizenStore(4);
    const citizenId = spawnCitizen(citizens, 0, 0, 0, 10);
    applyHomeEvents(homes, citizens, [{ kind: "deposit", citizenId, x: 0, y: 0, amount: 10 }]);

    const home = [...homes.homes.values()][0];
    expect(home.memberIds.has(citizenId)).toBe(true);

    // Simulate tick.ts's death-handling addition.
    const slot = citizens.idToSlot.get(citizenId)!;
    if (citizens.hasHome[slot]) {
      homes.homes.get(citizens.homeId[slot])?.memberIds.delete(citizenId);
    }
    killAtSlot(citizens, slot);

    expect(homes.homes.has(home.id)).toBe(true); // record survives
    expect(home.memberIds.has(citizenId)).toBe(false); // membership cleaned up
  });
});
