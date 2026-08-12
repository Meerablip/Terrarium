// Runs the simulation with zero Pixi/DOM involvement, proving /src/sim is
// genuinely renderer-independent. Run via `npm run sim:headless`.

import { createWorld } from "./world.ts";
import { tick } from "./tick.ts";

const TICKS_TO_RUN = 500;
const LOG_EVERY = 50;

const world = createWorld();

console.log(`Starting headless run: ${TICKS_TO_RUN} ticks, initial population ${world.citizens.count}`);

for (let i = 0; i < TICKS_TO_RUN; i++) {
  tick(world);

  if (world.tick % LOG_EVERY === 0) {
    const { citizens } = world;
    let totalResource = 0;
    for (let j = 0; j < citizens.count; j++) totalResource += citizens.resource[j];
    const avgResource = citizens.count > 0 ? totalResource / citizens.count : 0;

    console.log(
      `tick ${world.tick}: population=${citizens.count} avgResource=${avgResource.toFixed(2)}`,
    );
  }
}

console.log("Headless run complete.");
