// Runs the simulation with zero renderer/DOM involvement, proving /src/sim is
// genuinely renderer-independent — and doubling as the tuning instrument for
// the evolution parameters, since trait drift only becomes visible over tens
// of thousands of ticks (far more than anyone would watch interactively).
//
// Usage:
//   npm run sim:headless                  # default run
//   npm run sim:headless -- 200000        # tick count
//   npm run sim:headless -- 200000 10000  # tick count + log interval

import { computePopulationStats, formatPopulationStats } from "./stats.ts";
import { createWorld } from "./world.ts";
import { describeWorldConfig, worldConfigFromEnv } from "./worldPresets.ts";
import { tick } from "./tick.ts";

const ticksToRun = Number(process.argv[2] ?? 20000);
const logEvery = Number(process.argv[3] ?? Math.max(1, Math.floor(ticksToRun / 20)));

const worldConfig = worldConfigFromEnv();
const world = createWorld(worldConfig);

console.log(`Headless run: ${ticksToRun} ticks, ${describeWorldConfig(worldConfig)}`);
console.log(`  grid ${world.terrain.cols}x${world.terrain.rows} cells, initial population ${world.citizens.count}`);
console.log(formatPopulationStats(computePopulationStats(world.citizens, world.tick)));

for (let i = 0; i < ticksToRun; i++) {
  tick(world);

  if (world.tick % logEvery === 0) {
    console.log(formatPopulationStats(computePopulationStats(world.citizens, world.tick)));
  }

  if (world.citizens.count === 0) {
    console.log(`EXTINCTION at tick ${world.tick}`);
    break;
  }
}

const final = computePopulationStats(world.citizens, world.tick);
console.log("\n--- final ---");
console.log(formatPopulationStats(final));
console.log(
  `vision  mean=${final.visionRadius.mean.toFixed(2)} sd=${final.visionRadius.stdDev.toFixed(2)} ` +
    `range=[${final.visionRadius.min.toFixed(1)}, ${final.visionRadius.max.toFixed(1)}]`,
);
console.log(
  `speed   mean=${final.speed.mean.toFixed(3)} sd=${final.speed.stdDev.toFixed(3)} ` +
    `range=[${final.speed.min.toFixed(2)}, ${final.speed.max.toFixed(2)}]`,
);
console.log(`max generation reached: ${final.generation.max}`);
