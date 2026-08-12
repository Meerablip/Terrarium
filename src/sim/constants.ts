// ---------------------------------------------------------------------------
// Terrarium simulation constants — the single source of truth for every
// tunable rule value. Nothing in /src/sim should hardcode a numeric literal
// that belongs here. Units: 1 world unit == 1 pixel at zoom 1.0.
// ---------------------------------------------------------------------------

// --- World / terrain grid ---
export const GRID_COLS = 100; // terrain grid width, in cells
export const GRID_ROWS = 100; // terrain grid height, in cells
export const CELL_SIZE = 16; // world units per cell edge (world is 1600x1600 units)

// --- Terrain generation ---
export const TERRAIN_BLOB_COUNT = 6; // number of gaussian fertile "blobs" scattered across the map
export const TERRAIN_BLOB_SIGMA_MIN = 8; // min gaussian falloff radius, in cells
export const TERRAIN_BLOB_SIGMA_MAX = 18; // max gaussian falloff radius, in cells
export const TERRAIN_BLOB_PEAK_MIN = 0.6; // min blob peak contribution, fraction of max capacity
export const TERRAIN_BLOB_PEAK_MAX = 1.0; // max blob peak contribution, fraction of max capacity
export const TERRAIN_NOISE_AMPLITUDE = 0.15; // +/- fraction of capacity added as per-cell random noise
export const TERRAIN_BASE_CAPACITY = 100; // max resource capacity for every cell (uniform ceiling)
export const TERRAIN_MIN_STARTING_FRACTION = 0.5; // cells start at >= this fraction of their capacity

// --- Terrain regrowth (rule 1) ---
export const REGROWTH_RATE = 0.5; // resource regrown per cell per tick, capped at capacity

// --- Citizen metabolism (rule 2) ---
export const METABOLISM_RATE = 0.3; // resource lost per citizen per tick

// --- Citizen vision + movement + harvest (rule 3) ---
export const VISION_RADIUS = 64; // world units; citizens scan cells within this radius
export const MOVE_SPEED = 6; // max world units a citizen can travel toward its target per tick
export const MAX_INTAKE = 4; // max resource a citizen can harvest from a cell per tick

// --- Reproduction (rule 4) ---
export const REPRODUCTION_THRESHOLD = 80; // resource level at which a citizen spawns a child
export const REPRODUCTION_SPLIT_FRACTION = 0.5; // fraction of parent's resource given to child

// --- Population ---
export const INITIAL_POPULATION = 50; // citizens spawned at world creation
export const MAX_POPULATION = 400; // hard cap; reproduction is skipped once reached

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
export const HOME_ATTACH_RADIUS = 20; // world units; join-existing-home-on-deposit threshold

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
export const PATH_WEAR_TINT_STRENGTH = 0.6; // 0..1, max tint blend at PATH_WEAR_MAX
export const ROAD_WEAR_THRESHOLD = 0.4; // avg pathWear along a route to render a road in map view

// --- Weather (rule 7) ---
export const WEATHER_INTERVAL_TICKS = 2000; // avg ticks between weather events
export const WEATHER_JITTER_TICKS = 400; // +/- random jitter on the interval
export const WEATHER_DURATION_TICKS = 300; // ticks a weather event stays active
export const WEATHER_REGION_RADIUS = 20; // world units
export const WEATHER_MOISTURE_BOOST = 1.8; // regrowth multiplier within the region while active
export const WEATHER_TINT_STRENGTH = 0.5; // 0..1 tint blend toward green while active

// --- Render view modes (rule 9) ---
export const MAP_VIEW_ZOOM_THRESHOLD = 0.5; // viewport.scaled below this switches to map view
