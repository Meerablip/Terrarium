// Sprite/tile loading and slicing for the Cute Fantasy pack (Kenmi — see
// /THIRD_PARTY_NOTICES.md; credit is required by its license, not optional).
// Curated copies live in src/assets/.
//
// None of these sheets ship a companion atlas, so every frame rect here is a
// hand-written constant. They were established by cropping the real PNGs and
// looking at them — not inferred from the file dimensions, which is not
// sufficient (a 48x96 sheet could be 3x6 of 16px or 1.5x3 of 32px, and the
// blob sheets turned out to have a non-obvious internal layout).

import { Assets, Rectangle, Texture } from "pixi.js";

import playerUrl from "../assets/citizen/Player.png";
import grassUrl from "../assets/tiles/Grass_Middle.png";
import pathMiddleUrl from "../assets/tiles/Path_Middle.png";
import waterMiddleUrl from "../assets/tiles/Water_Middle.png";
import houseUrl from "../assets/buildings/House_1_Wood_Base_Blue.png";
import oakTreeUrl from "../assets/nature/Oak_Tree.png";
import oakTreeSmallUrl from "../assets/nature/Oak_Tree_Small.png";
import decorUrl from "../assets/props/Outdoor_Decor_Free.png";

export const TILE = 16;

// ---------------------------------------------------------------------------
// Player.png — 192x320, a 6x10 grid of 32x32 frames.
// Rows 0-3 are the clean 4-directional walk cycles. Rows 4-9 are a mix of
// idle/action/portrait frames that don't form a usable directional set, so
// they're ignored (Player_Actions.png is the real tool-use sheet).
// ---------------------------------------------------------------------------
const PLAYER_FRAME = 32;
const PLAYER_COLS = 6;
const PLAYER_DIRECTION_ROW = { down: 0, up: 1, left: 2, right: 3 } as const;

export type Direction = keyof typeof PLAYER_DIRECTION_ROW;

function sub(base: Texture, col: number, row: number, size = TILE): Texture {
  return new Texture({
    source: base.source,
    frame: new Rectangle(col * size, row * size, size, size),
  });
}

// ---------------------------------------------------------------------------
// Outdoor_Decor_Free.png — 112x192, a 7x12 grid of 16px icons. No companion
// atlas here either; these coordinates were picked by eye off decor_grid.png
// (a scratch contact sheet, not checked in) rather than guessed from the raw
// dimensions.
//
//   (0,0), (1,0), (2,0) : three small grass-tuft variants — decorative
//                         ground cover, unrelated to the sim's `resource`
//                         field. See terrainLayer.ts's patch-growth system.
//   (2,2)               : a fist-sized rock cluster, used as the stone
//                         material's world icon and as one of the permanent
//                         nature-layer decorations (see natureLayer.ts).
// ---------------------------------------------------------------------------
const GRASS_PATCH_COORDS: Array<[col: number, row: number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
];
const ROCK_COORD: [col: number, row: number] = [2, 2];

// ---------------------------------------------------------------------------
// Oak_Tree_Small.png — 96x48, a clean 3x1 grid of 32x48 frames: a tiny
// sapling/shrub, then two full-canopy tree variants. Used only by
// natureLayer.ts's permanent decorative scatter — the full-size Oak_Tree.png
// above remains the one used for the sim's harvestable wood material nodes,
// so the two are visually distinct at a glance.
// ---------------------------------------------------------------------------
const SMALL_TREE_FRAME = 32;
const BUSH_COL = 0;
const SMALL_TREE_COLS = [1, 2];

let grassTexture: Texture | null = null;
let dirtFillTexture: Texture | null = null;
let waterFillTexture: Texture | null = null;
let houseTexture: Texture | null = null;
let oakTreeTexture: Texture | null = null;
let grassPatchTextures: Texture[] = [];
let rockTexture: Texture | null = null;
let bushTexture: Texture | null = null;
let smallTreeTextures: Texture[] = [];
const playerFrames = new Map<Direction, Texture[]>();

let loaded = false;

/** Loads and slices every sheet. Await once at startup before any getter
 * below; they throw rather than silently returning an empty texture, since a
 * blank sprite is far harder to diagnose than a thrown error. */
export async function ensureAssetsLoaded(): Promise<void> {
  if (loaded) return;

  const [player, grass, pathMiddle, waterMiddle, house, oak, oakSmall, decor] = await Promise.all([
    Assets.load(playerUrl) as Promise<Texture>,
    Assets.load(grassUrl) as Promise<Texture>,
    Assets.load(pathMiddleUrl) as Promise<Texture>,
    Assets.load(waterMiddleUrl) as Promise<Texture>,
    Assets.load(houseUrl) as Promise<Texture>,
    Assets.load(oakTreeUrl) as Promise<Texture>,
    Assets.load(oakTreeSmallUrl) as Promise<Texture>,
    Assets.load(decorUrl) as Promise<Texture>,
  ]);

  // Both are flat, seamlessly-tileable 16px tiles — used as repeating fill
  // patterns for the vector-shaped pond/clearing overlays in terrainLayer.ts
  // (see its top-of-file comment for why those are vector shapes, not
  // autotiled sprites, in the first place). "repeat" isn't the default
  // address mode, so it has to be set explicitly before first use as a fill.
  pathMiddle.source.addressMode = "repeat";
  waterMiddle.source.addressMode = "repeat";

  for (const direction of Object.keys(PLAYER_DIRECTION_ROW) as Direction[]) {
    const row = PLAYER_DIRECTION_ROW[direction];
    const frames: Texture[] = [];
    for (let col = 0; col < PLAYER_COLS; col++) {
      frames.push(
        new Texture({
          source: player.source,
          frame: new Rectangle(col * PLAYER_FRAME, row * PLAYER_FRAME, PLAYER_FRAME, PLAYER_FRAME),
        }),
      );
    }
    playerFrames.set(direction, frames);
  }

  grassTexture = grass;
  dirtFillTexture = pathMiddle;
  waterFillTexture = waterMiddle;
  houseTexture = house;
  oakTreeTexture = oak;
  grassPatchTextures = GRASS_PATCH_COORDS.map(([col, row]) => sub(decor, col, row));
  rockTexture = sub(decor, ROCK_COORD[0], ROCK_COORD[1]);
  bushTexture = sub(oakSmall, BUSH_COL, 0, SMALL_TREE_FRAME);
  smallTreeTextures = SMALL_TREE_COLS.map((col) => sub(oakSmall, col, 0, SMALL_TREE_FRAME));
  loaded = true;
}

function must<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`assets: ${name} requested before ensureAssetsLoaded() resolved`);
  return value;
}

export function getPlayerWalkFrames(direction: Direction): Texture[] {
  const frames = playerFrames.get(direction);
  if (!frames) throw new Error("assets: player frames requested before ensureAssetsLoaded() resolved");
  return frames;
}

export const getGrassTexture = (): Texture => must(grassTexture, "grass");
export const getDirtFillTexture = (): Texture => must(dirtFillTexture, "dirt fill");
export const getWaterFillTexture = (): Texture => must(waterFillTexture, "water fill");
export const getHouseTexture = (): Texture => must(houseTexture, "house");
export const getOakTreeTexture = (): Texture => must(oakTreeTexture, "oak tree");
export const getRockTexture = (): Texture => must(rockTexture, "rock");
export const getBushTexture = (): Texture => must(bushTexture, "bush");

export function getGrassPatchTexture(variant: number): Texture {
  if (grassPatchTextures.length === 0) {
    throw new Error("assets: grass patch requested before ensureAssetsLoaded() resolved");
  }
  return grassPatchTextures[variant % grassPatchTextures.length];
}

export function getSmallTreeTexture(variant: number): Texture {
  if (smallTreeTextures.length === 0) {
    throw new Error("assets: small tree requested before ensureAssetsLoaded() resolved");
  }
  return smallTreeTextures[variant % smallTreeTextures.length];
}
