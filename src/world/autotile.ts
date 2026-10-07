// Which tileset frame each map cell shows ("autotiling"). Pure functions, no Phaser: the game
// (World.ts), the map editor and the unit tests all use them, and src/art/tiles.ts paints one
// image per frame listed in TILE_FRAMES.
//
// Floors: one frame per floor tile, plus look-alike versions picked per cell (grass with
// flowers, cracked asphalt, scuffed hallway...) so big areas don't look stamped, and a darker
// band where a wall casts its shadow (on the top edge below a wall, the left edge beside one).
//
// Walls are seen from above at an angle, like a Pokemon overworld:
//   'face'  the front of the wall, shown when the cell below is NOT a wall. It has a thin strip
//           of the wall's top along its upper edge, then the wall itself down to the floor.
//   'top'   the cap seen from above, shown when the cell below is a wall (the inside of a thick
//           wall, or a wall running up and down the screen).
// Each frame draws a dark edge line on the sides where the wall ends, so walls look right one
// tile thick or as big blocks. Fences are see-through: the floor is drawn under them.

import { PX } from '../art/pixel';
import { TILES } from './legend';

/** Texture key of the generated tileset (src/art/tiles.ts). */
export const TILESET_TEXTURE = 'tileset-school';
/** Art pixels per tile (one tile = TILE_ART * PX = 64 screen pixels). */
export const TILE_ART = 16;
/** Frames per row in the tileset texture. */
export const TILESET_COLUMNS = 16;
/**
 * Each frame is surrounded by a copy of its own edge pixels, this many art pixels wide, so a
 * zoomed or scrolled camera never shows a sliver of the neighbouring frame (tile seams).
 */
export const TILESET_PAD = 1;
/** Pass these to Tilemap.addTilesetImage (screen pixels). */
export const TILESET_MARGIN = TILESET_PAD * PX;
export const TILESET_SPACING = TILESET_PAD * 2 * PX;

/** Walls you can see through: drawn over the floor, and they don't cast shadows (fences). */
export const SEE_THROUGH_WALLS = new Set(['F']);

/**
 * How many versions of each floor exist (version 0 is the plain one) and how often the plain
 * one is used. A floor missing here has just the plain version.
 */
export const FLOOR_VARIANTS: Record<string, { count: number; plain: number }> = {
  '.': { count: 4, plain: 0.55 },
  ',': { count: 2, plain: 0.7 },
  b: { count: 4, plain: 0.7 },
  j: { count: 2, plain: 0.85 },
  o: { count: 2, plain: 0.5 },
  p: { count: 4, plain: 0.5 },
  // Parking lines are picked by their neighbours, not at random: 0 middle, 1 top end, 2 bottom end, 3 both.
  '|': { count: 4, plain: 1 },
  _: { count: 2, plain: 0.7 },
  g: { count: 4, plain: 0.45 },
  '=': { count: 2, plain: 0.5 },
  k: { count: 2, plain: 0.5 },
  n: { count: 1, plain: 1 },
  '~': { count: 1, plain: 1 },
  '^': { count: 1, plain: 1 },
};

/** Versions of a wall's front (whiteboards with different scribbles, weathered bricks). */
export const WALL_FACE_VARIANTS: Record<string, number> = { W: 3, B: 2 };

/** One side of a wall: another wall continues there ('closed'), the wall ends ('open'), or (for caps) the wall beside it is a face. */
export type WallSide = 'closed' | 'open' | 'face';

export interface FloorFrame {
  kind: 'floor';
  char: string;
  variant: number;
  /** A wall casts a shadow on this cell from above. */
  shadeTop: boolean;
  /** ...from the left. */
  shadeLeft: boolean;
}

export interface WallFrame {
  kind: 'wall';
  char: string;
  part: 'face' | 'top';
  variant: number;
  /** The wall ends at the top of this cell (no wall above). */
  openTop: boolean;
  left: WallSide;
  right: WallSide;
  /** Inner corners: the walls above and beside continue, but the diagonal cell between them is floor. */
  cornerLeft: boolean;
  cornerRight: boolean;
}

export type TileFrame = FloorFrame | WallFrame;

/** A unique name per frame (also the texture frame name in the tileset). */
export function frameName(f: TileFrame): string {
  if (f.kind === 'floor') return `floor ${f.char} ${f.variant} ${f.shadeTop ? 't' : '-'}${f.shadeLeft ? 'l' : '-'}`;
  const side = (s: WallSide) => s[0];
  return `wall ${f.char} ${f.part} ${f.variant} ${f.openTop ? 'n' : '-'}${side(f.left)}${side(f.right)}${f.cornerLeft ? 'L' : '-'}${f.cornerRight ? 'R' : '-'}`;
}

export const floorVariantCount = (ch: string) => FLOOR_VARIANTS[ch]?.count ?? 1;
export const wallFaceVariantCount = (ch: string) => WALL_FACE_VARIANTS[ch] ?? 1;

/** Every combination of wall edges a frame can have (corners only where they can show). */
function wallEdges(part: 'face' | 'top'): Pick<WallFrame, 'openTop' | 'left' | 'right' | 'cornerLeft' | 'cornerRight'>[] {
  const sides: WallSide[] = part === 'top' ? ['closed', 'open', 'face'] : ['closed', 'open'];
  const out: Pick<WallFrame, 'openTop' | 'left' | 'right' | 'cornerLeft' | 'cornerRight'>[] = [];
  for (const openTop of [false, true]) {
    for (const left of sides) {
      for (const right of sides) {
        for (const cornerLeft of [false, true]) {
          for (const cornerRight of [false, true]) {
            if (cornerLeft && (openTop || left === 'open')) continue;
            if (cornerRight && (openTop || right === 'open')) continue;
            out.push({ openTop, left, right, cornerLeft, cornerRight });
          }
        }
      }
    }
  }
  return out;
}

function listFrames(): TileFrame[] {
  const frames: TileFrame[] = [];
  for (const t of TILES) {
    if (t.layer === 'floor') {
      for (let variant = 0; variant < floorVariantCount(t.char); variant++) {
        for (const shadeTop of [false, true]) for (const shadeLeft of [false, true]) frames.push({ kind: 'floor', char: t.char, variant, shadeTop, shadeLeft });
      }
    } else if (SEE_THROUGH_WALLS.has(t.char)) {
      // Fences only care whether they connect to the next piece: no faces beside caps, no corners.
      for (const part of ['face', 'top'] as const) {
        for (const e of wallEdges('face')) if (!e.cornerLeft && !e.cornerRight) frames.push({ kind: 'wall', char: t.char, part, variant: 0, ...e });
      }
    } else {
      for (const e of wallEdges('top')) frames.push({ kind: 'wall', char: t.char, part: 'top', variant: 0, ...e });
      for (let variant = 0; variant < wallFaceVariantCount(t.char); variant++) {
        for (const e of wallEdges('face')) frames.push({ kind: 'wall', char: t.char, part: 'face', variant, ...e });
      }
    }
  }
  return frames;
}

/** Every frame of the tileset, in texture order (index = tile index in the tilemap). */
export const TILE_FRAMES: readonly TileFrame[] = listFrames();
const FRAME_INDEX = new Map(TILE_FRAMES.map((f, i) => [frameName(f), i]));

/** Index of a frame in the tileset, or -1 if there is no such frame. */
export function frameIndex(f: TileFrame): number {
  return FRAME_INDEX.get(frameName(f)) ?? -1;
}

/** Where frame `index` sits in the tileset texture (screen pixels, without the padding). */
export function frameRect(index: number): { x: number; y: number; w: number; h: number } {
  const size = TILE_ART * PX;
  const step = size + TILESET_SPACING;
  return { x: TILESET_MARGIN + (index % TILESET_COLUMNS) * step, y: TILESET_MARGIN + Math.floor(index / TILESET_COLUMNS) * step, w: size, h: size };
}

/** A stable pseudo-random number for a cell, so the same map always looks the same. */
export function cellHash(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041)) | 0;
  // MurmurHash3's finaliser: mixes every input bit into every output bit, so cells on a regular
  // grid (parking spaces every 3 tiles) still get unrelated picks.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Picks one of `list` for a cell (e.g. a car colour), the same every time. */
export function pickForCell<T>(list: readonly T[], x: number, y: number, salt = 0): T {
  return list[Math.floor((cellHash(x, y, salt) / 0x100000000) * list.length)];
}

const charSalt = (ch: string) => ch.charCodeAt(0) * 7919;

/** Which version of a floor a cell shows: the plain one most of the time, otherwise a random other one. */
export function floorVariant(ch: string, x: number, y: number): number {
  const v = FLOOR_VARIANTS[ch];
  if (!v || v.count <= 1) return 0;
  const r = cellHash(x, y, charSalt(ch)) / 0x100000000;
  if (r < v.plain) return 0;
  return 1 + Math.min(v.count - 2, Math.floor(((r - v.plain) / (1 - v.plain)) * (v.count - 1)));
}

/** The parts of a parsed map (src/world/mapText.ts) the autotiler reads. */
export interface TileGrid {
  width: number;
  height: number;
  /** Tile index (into TILES) of the floor per cell, -1 under walls. */
  floor: readonly (readonly number[])[];
  /** Tile index of the wall per cell, -1 where there is none. */
  walls: readonly (readonly number[])[];
  /** The map as written, one string per row (to see which cells hold a tree or a car). */
  rows?: readonly string[];
}

/**
 * The map parser puts the nearest floor (left first) under a thing, which looks wrong for some:
 * a tree at the left edge of a grass island would stand on asphalt, a parked car on a parking
 * line. When one of these is next to such a thing, it stands on that floor instead.
 */
export const PREFERRED_FLOOR: Record<string, string> = { T: 'g', C: 'p' };

function preferredFloor(g: TileGrid, x: number, y: number): string | null {
  const want = PREFERRED_FLOOR[g.rows?.[y]?.[x] ?? ''];
  if (!want) return null;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
  ]) {
    if (floorCharAt(g, x + dx, y + dy) === want) return want;
  }
  return null;
}

const wallCharAt = (g: TileGrid, x: number, y: number): string | null => {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
  const i = g.walls[y][x];
  return i >= 0 ? (TILES[i]?.char ?? null) : null;
};

const floorCharAt = (g: TileGrid, x: number, y: number): string | null => {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return null;
  const i = g.floor[y][x];
  return i >= 0 ? (TILES[i]?.char ?? null) : null;
};

const isSolidWall = (g: TileGrid, x: number, y: number) => {
  const ch = wallCharAt(g, x, y);
  return ch !== null && !SEE_THROUGH_WALLS.has(ch);
};

/** The frame for the cell's wall, or null when it has none. */
export function wallFrameAt(g: TileGrid, x: number, y: number): WallFrame | null {
  const ch = wallCharAt(g, x, y);
  if (ch === null) return null;
  const fence = SEE_THROUGH_WALLS.has(ch);
  // A fence connects to any wall; a solid wall only joins solid walls (it ends at a fence).
  const joins = (cx: number, cy: number) => (fence ? wallCharAt(g, cx, cy) !== null : isSolidWall(g, cx, cy));
  const part = joins(x, y + 1) ? 'top' : 'face';
  const openTop = !joins(x, y - 1);
  const side = (dx: number): WallSide => {
    if (!joins(x + dx, y)) return 'open';
    return part === 'top' && !fence && !joins(x + dx, y + 1) ? 'face' : 'closed';
  };
  const left = side(-1);
  const right = side(1);
  const corner = (dx: number, s: WallSide) => !fence && !openTop && s !== 'open' && !joins(x + dx, y - 1);
  const variant = part === 'face' && !fence ? (wallFaceVariantCount(ch) > 1 ? cellHash(x, y, charSalt(ch)) % wallFaceVariantCount(ch) : 0) : 0;
  return { kind: 'wall', char: ch, part, variant, openTop, left, right, cornerLeft: corner(-1, left), cornerRight: corner(1, right) };
}

/** The floor char drawn under a fence: the floor beside it (below first), grass when there is none. */
function floorUnderFence(g: TileGrid, x: number, y: number): string {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const ch = floorCharAt(g, x + dx, y + dy);
    if (ch) return ch;
  }
  return 'g';
}

/** The frame for the cell's floor, or null under a solid wall. */
export function floorFrameAt(g: TileGrid, x: number, y: number): FloorFrame | null {
  const wall = wallCharAt(g, x, y);
  if (wall !== null && !SEE_THROUGH_WALLS.has(wall)) return null;
  const ch = wall !== null ? floorUnderFence(g, x, y) : (preferredFloor(g, x, y) ?? floorCharAt(g, x, y) ?? '.');
  let variant: number;
  if (ch === '|') variant = (floorCharAt(g, x, y - 1) === '|' ? 0 : 1) | (floorCharAt(g, x, y + 1) === '|' ? 0 : 2);
  else variant = floorVariant(ch, x, y);
  // Fences cast no shadow, and nothing is shaded under one.
  const shade = wall === null;
  return { kind: 'floor', char: ch, variant, shadeTop: shade && isSolidWall(g, x, y - 1), shadeLeft: shade && isSolidWall(g, x - 1, y) };
}

/** Tileset index for the cell's floor (-1 for none). */
export function floorTileAt(g: TileGrid, x: number, y: number): number {
  const f = floorFrameAt(g, x, y);
  return f ? frameIndex(f) : -1;
}

/** Tileset index for the cell's wall (-1 for none). */
export function wallTileAt(g: TileGrid, x: number, y: number): number {
  const f = wallFrameAt(g, x, y);
  return f ? frameIndex(f) : -1;
}

/** Tileset indexes for a whole map: one array per layer, rows of cells. */
export function tileLayers(g: TileGrid): { floor: number[][]; walls: number[][] } {
  const floor: number[][] = [];
  const walls: number[][] = [];
  for (let y = 0; y < g.height; y++) {
    const f: number[] = [];
    const w: number[] = [];
    for (let x = 0; x < g.width; x++) {
      f.push(floorTileAt(g, x, y));
      w.push(wallTileAt(g, x, y));
    }
    floor.push(f);
    walls.push(w);
  }
  return { floor, walls };
}

/** The frame used for a tile's icon (editor palette): a plain floor, or a piece from the middle of a wall's front. */
export function iconFrame(ch: string): number {
  const t = TILES.find((d) => d.char === ch);
  if (!t) return -1;
  if (t.layer === 'floor') return frameIndex({ kind: 'floor', char: ch, variant: 0, shadeTop: false, shadeLeft: false });
  return frameIndex({ kind: 'wall', char: ch, part: 'face', variant: 0, openTop: true, left: 'closed', right: 'closed', cornerLeft: false, cornerRight: false });
}

/** Which wall a wall-mounted fixture hangs on: the one above it (front view), else the one to its left or right (side view). */
export type Mount = 'front' | 'left' | 'right';

export function wallMount(isWall: (x: number, y: number) => boolean, x: number, y: number): Mount {
  if (isWall(x, y - 1)) return 'front';
  if (isWall(x - 1, y)) return 'left';
  if (isWall(x + 1, y)) return 'right';
  return 'front';
}
