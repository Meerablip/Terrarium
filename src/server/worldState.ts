// Module-level World singleton. There is exactly one world per server
// process (no multi-tenancy anywhere in scope), and tick(world) already
// takes an explicit mutable object, so a plain singleton holder is the
// simplest thing that matches how the rest of the codebase already treats
// World — no class wrapper needed.

import type { World } from "../sim/world.ts";

let currentWorld: World | null = null;

export function setWorld(world: World): void {
  currentWorld = world;
}

export function getWorld(): World {
  if (!currentWorld) {
    throw new Error("World not initialized — setWorld() must be called before getWorld()");
  }
  return currentWorld;
}
