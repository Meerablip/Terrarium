// ---------------------------------------------------------------------------
// Terrarium simulation constants — the single source of truth for every
// tunable rule value. Nothing in /src/sim should hardcode a numeric literal
// that belongs here. Units: 1 world unit == 1 pixel at zoom 1.0.
// ---------------------------------------------------------------------------

// --- World / terrain grid ---
// Defaults. World dimensions are configurable per-world (see WorldConfig in
// world.ts) — these are the fallback, not a global truth. Anything sizing a
// buffer must read the live terrain's own cols/rows, never these constants.
export const GRID_COLS = 100; // terrain grid width, in cells
export const GRID_ROWS = 100; // terrain grid height, in cells
export const CELL_SIZE = 16; // world units per cell edge (world is 1600x1600 units)

// --- Sandbox preset ---
// A deliberately small world for *observing* agents rather than surveying a
// map. At the renderer's intended zoom (~30x20 tiles on screen) the default
// 100x100 grid shows ~2% of the world at a time — you can never follow the
// same agent twice, which makes "are the agents behaving sensibly?"
// unanswerable by watching. 40x40 is legible end to end.
//
// Note this is NOT just a viewing window: world area is a lever on the
// fitness landscape. Carrying capacity scales with area x REGROWTH_RATE, and
// density determines whether spatial traits (visionRadius, speed) pay for
// themselves at all — at high density food is always adjacent and vision
// evolves straight to its floor. Expect traits to re-adapt when the world
// size changes; that's real, not a bug.
export const SANDBOX_GRID_COLS = 76;
export const SANDBOX_GRID_ROWS = 56;
export const SANDBOX_INITIAL_POPULATION = 24;

// --- Terrain generation ---
export const TERRAIN_BLOB_COUNT = 6; // number of gaussian fertile "blobs" scattered across the map
export const TERRAIN_BLOB_SIGMA_MIN = 8; // min gaussian falloff radius, in cells
export const TERRAIN_BLOB_SIGMA_MAX = 18; // max gaussian falloff radius, in cells
export const TERRAIN_BLOB_PEAK_MIN = 0.6; // min blob peak contribution, fraction of max capacity
export const TERRAIN_BLOB_PEAK_MAX = 1.0; // max blob peak contribution, fraction of max capacity
export const TERRAIN_NOISE_AMPLITUDE = 0.15; // +/- fraction of capacity added as per-cell random noise
export const TERRAIN_BASE_CAPACITY = 100; // max resource capacity for every cell (uniform ceiling)
export const TERRAIN_MIN_STARTING_FRACTION = 0.5; // cells start at >= this fraction of their capacity

// --- Ponds (decorative water features, rule N/A — cosmetic, not a sim rule) ---
// Carved out of terrain AFTER createTerrain returns (see generatePonds in
// terrain.ts), not as part of blob generation — keeps createTerrain's own rng
// draw sequence, and therefore every unit test that calls it directly with a
// fixed seed, completely unaffected. Only createWorld's real pipeline draws
// ponds. A pond cell's capacity/resource is zeroed, so nothing forages there
// and citizens have no reason to linger — nothing chases food into the water.
export const POND_COUNT = 1; // ponds generated per world
export const POND_RADIUS_CELLS = 5; // approx radius, in cells, before edge jitter
export const POND_EDGE_JITTER = 1.4; // +/- cells of per-cell noise, so the shoreline isn't a perfect circle

// --- Terrain regrowth (rule 1) ---
// Sets the world's carrying capacity, and therefore how hard selection bites.
// At the old 0.5 the map regrew ~5,000 resource/tick against ~120/tick of
// total consumption — a ~40x surplus, under which literally nothing ever
// starved and MAX_POPULATION (not ecology) was the only thing bounding the
// population. That is a static equilibrium, not an evolving one. Tuned down
// so food is genuinely contested; the equilibrium population that results is
// an emergent property, not a configured one (see scripts/ tuning runs).
export const REGROWTH_RATE = 0.009; // resource regrown per cell per tick, capped at capacity

// --- Citizen metabolism (rule 2) ---
// Metabolism is DERIVED from a citizen's traits, not an independent gene —
// see traits.ts. If it were heritable on its own, evolution would trivially
// drive it toward zero (a free lunch: same vision and speed, no upkeep) and
// the trait space would collapse to a single degenerate corner. Deriving it
// makes vision and speed cost something, which is what turns "bigger is
// always better" into an actual fitness tradeoff.
//
// Calibrated so a citizen at the founding traits (VISION_RADIUS=64,
// MOVE_SPEED=6) burns ~0.30/tick, matching the old flat METABOLISM_RATE —
// so baseline behavior is comparable to before the change.
export const METABOLISM_BASE = 0.1; // upkeep floor, paid regardless of traits
export const METABOLISM_SPEED_COST = 0.0025; // multiplied by speed^2 (superlinear: fast movement is disproportionately costly)
// Vision was originally priced at 0.0017/unit, which measured out as
// dominant: a 20k-tick run drove visionRadius from 64 to 17 and still
// falling, because at the resulting population density food is always within
// a cell or two and a wide search radius buys nothing it can't get for free.
// Repriced so vision is affordable enough to be worth carrying when it does
// pay off, instead of being a pure tax.
export const METABOLISM_VISION_COST = 0.0008; // multiplied by visionRadius (linear)

// --- Citizen vision + movement + harvest (rule 3) ---
export const VISION_RADIUS = 64; // world units; citizens scan cells within this radius
export const MOVE_SPEED = 6; // max world units a citizen can travel toward its target per tick
export const MAX_INTAKE = 4; // max resource a citizen can harvest from a cell per tick

// --- Reproduction (rule 4) ---
export const REPRODUCTION_THRESHOLD = 80; // resource level at which a citizen spawns a child
export const REPRODUCTION_SPLIT_FRACTION = 0.5; // fraction of parent's resource given to child

// --- Population ---
export const INITIAL_POPULATION = 50; // citizens spawned at world creation
// A safety rail against runaway allocation, NOT the intended population
// bound. It used to be 400 and the world sat pinned at exactly 400 forever,
// which actively prevented evolution: at the cap, reproduction is skipped
// and resource is clamped, so the fittest citizen cannot out-reproduce the
// least fit — the single mechanism selection runs on was disabled. Raised
// well above the expected ecological equilibrium so REGROWTH_RATE (scarcity)
// is what actually bounds the population.
export const MAX_POPULATION = 5000;

// --- Determinism ---
export const WORLD_SEED = 1337; // seed for terrain gen + initial citizen placement RNG

// ---------------------------------------------------------------------------
// Phase 2 — arrangement emergence
// ---------------------------------------------------------------------------

// --- Decide/Move/Heading split (rule 1) ---
export const DECIDE_INTERVAL_TICKS = 15; // ticks between vision re-scans per citizen
export const MEMORY_MIN_RESOURCE_TO_TRUST = 20; // min terrain.resource at a remembered cell to prefer it over a fresh scan

// --- Memory (rule 2) ---
export const MEMORY_CAPACITY = 4; // rolling remembered-location slots per citizen
export const MEMORY_MIN_PAYOFF = 2; // min harvested amount this tick to write a memory entry

// --- Materials (rule 3) ---
export const MATERIAL_COUNT = 120; // total material nodes scattered at world-gen
export const MATERIAL_KIND_COUNT = 2; // wood=0, stone=1
export const MATERIAL_QTY_MIN = 20; // min quantity at a freshly-generated material node
export const MATERIAL_QTY_MAX = 60; // max quantity at a freshly-generated material node
export const MATERIAL_INTERACT_RADIUS = 4; // world units; arrival-at-node threshold
export const MATERIAL_GATHER_TICKS = 10; // ticks spent stationary gathering
export const MATERIAL_CARRY_CAPACITY = 15; // max quantity a citizen can carry at once
export const FORAGE_SURPLUS_THRESHOLD = 50; // min `resource` before switching FORAGE -> SEEK_MATERIAL

// --- Home / building (rule 4) ---
export const HOME_COMPLETE_THRESHOLD = 100; // cumulative buildProgress to complete a home
// world units; join-existing-home-on-deposit threshold. Was 20 (1.25 cells)
// — tight enough that citizens depositing a few cells apart each founded
// their own home rather than joining a neighbour's, so a single small
// population produced dozens of separate one-or-two-member homes packed
// together. Each stamps its own clearing radius (terrainLayer.ts), so many
// overlapping tiny homes read as fragmented, jagged bare ground rather than
// a few clean settlement plots. 80 was a first pass and still measured out
// to ~60 homes for 230 citizens at the 5-minute mark (headless: 6000 ticks)
// — still a dense "downtown." 120 nearly halves that (~35 homes, same
// population) without joins happening across implausible distances.
export const HOME_ATTACH_RADIUS = 120;

// --- Density/tier classifier + settlements (rule 8) ---
export const TIER_HUT_MIN = 4; // min population to be classified a hut
export const TIER_VILLAGE_MIN = 12; // min population to be classified a village
export const TIER_CITY_MIN = 30; // min population to be classified a city
export const TIER_MATERIAL_BONUS_THRESHOLD = 150; // summed complete-home buildProgress in-cluster to bump tier +1
export const SETTLEMENT_FOUND_THRESHOLD_TICKS = 100; // consecutive ticks a cluster must sustain before registering
export const SETTLEMENT_DISSOLVE_GRACE_TICKS = 60; // ticks below threshold before a registered settlement is deleted
export const SETTLEMENT_MATCH_RADIUS = 48; // world units; centroid-matching radius tick-to-tick

// --- Agriculture (rule 5, extends regrowTerrain) ---
export const AGRICULTURE_RADIUS_CELLS = 6; // cells around a complete Home that get boosted regrowth
export const AGRICULTURE_MULTIPLIER = 2.0; // regrowth multiplier within that radius

// --- Path wear (rule 6) ---
export const PATH_WEAR_INCREMENT = 0.05; // per occupying citizen per tick
export const PATH_WEAR_DECAY_RATE = 0.01; // per cell per tick
export const PATH_WEAR_MAX = 1.0;

// --- Weather (rule 7) ---
export const WEATHER_INTERVAL_TICKS = 2000; // avg ticks between weather events
export const WEATHER_JITTER_TICKS = 400; // +/- random jitter on the interval
export const WEATHER_DURATION_TICKS = 300; // ticks a weather event stays active
export const WEATHER_REGION_RADIUS = 20; // world units
export const WEATHER_MOISTURE_BOOST = 1.8; // regrowth multiplier within the region while active

// ---------------------------------------------------------------------------
// Phase 3 — evolution
//
// The Darwinian triad is variation + heritability + differential fitness.
// Heritability already existed (reproduction copies the parent's traits);
// these constants supply the missing two.
// ---------------------------------------------------------------------------

// --- Mutation (variation) ---
// Applied as a proportional gaussian: sigma scales with the trait's own
// magnitude, so a 64-unit vision and a 6-unit speed mutate at comparable
// *relative* rates without needing separately tuned absolute sigmas.
export const MUTATION_SIGMA_FRACTION = 0.08; // std dev as a fraction of the parent's trait value

// Hard bounds. These are not fitness limits (the metabolism cost function
// already makes extremes expensive) — they exist so a long tail of mutations
// can't drive a trait negative or absurd, which would break the systems that
// consume them (a negative visionRadius scans no cells; a huge speed
// teleports past targets).
export const VISION_RADIUS_MIN = 8;
export const VISION_RADIUS_MAX = 220;
export const MOVE_SPEED_MIN = 0.5;
export const MOVE_SPEED_MAX = 20;

// --- Senescence (differential fitness over a lifetime) ---
// Implemented as rising metabolic upkeep with age rather than a random death
// roll: deterministic (no extra RNG draw per citizen per tick, so the seeded
// stream stays cheap and reproducible), and it selects for traits that pay
// off *early* rather than merely surviving. Old citizens burn more and
// eventually can't out-forage their own upkeep.
// Onset was originally 15000, which measured out as completely inert: mean
// realized age in a 20k-tick run was ~1,770, so no citizen ever lived long
// enough to pay an aging penalty and `age` remained a field nothing acted on.
// Set below the observed mean lifespan so senescence actually shapes the
// upper tail rather than being dead configuration.
export const SENESCENCE_ONSET_TICKS = 1200; // no aging penalty before this age
export const SENESCENCE_PER_TICK = 0.0002; // added to the metabolism multiplier per tick beyond onset
export const SENESCENCE_MAX_MULTIPLIER = 4.0; // ceiling, so upkeep can't diverge without bound
