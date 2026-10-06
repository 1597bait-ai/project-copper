// The tileset: floors, wall faces and wall tops for every tile in src/world/legend.ts, drawn as
// pixel art at boot into one texture (TILESET_TEXTURE). src/world/autotile.ts lists the frames
// and picks one per map cell; this file only paints them.
//
// Look: Pokemon Gen 3 overworld. Flat colours lit from the top-left, no outlines on floors.
// To give a new tile in the legend its look, add it to FLOOR_ART or WALL_LOOKS below.

import type Phaser from 'phaser';
import {
  TILESET_COLUMNS,
  TILESET_PAD,
  TILESET_TEXTURE,
  TILE_ART,
  TILE_FRAMES,
  frameName,
  frameRect,
  type FloorFrame,
  type TileFrame,
  type WallFrame,
  type WallSide,
} from '../world/autotile';
import type { ArtModule } from './index';
import { Pix, addTexture, alpha, rng, shade, type Color } from './pixel';

const S = TILE_ART;
/** Rows 0..2 of a wall's front show the top of the wall, row 3 is its edge, then the wall itself. */
const STRIP = 3;
/** Cast shadows from walls onto the floor. */
const SHADOW = 0x2a2238;

// ---------------------------------------------------------------- helpers

/** Scatters single pixels (deterministic). `area` = [x, y, w, h], default the whole tile. */
function speckle(p: Pix, seed: number, count: number, colors: Color[], area: [number, number, number, number] = [0, 0, S, S]) {
  const r = rng(seed);
  const [ax, ay, aw, ah] = area;
  for (let i = 0; i < count; i++) p.set(ax + Math.floor(r() * aw), ay + Math.floor(r() * ah), colors[Math.floor(r() * colors.length)]);
}

/** A tile with a lit top-left edge and a grout line on the right and bottom (they line up across cells). */
function slab(p: Pix, base: number, light: number, grout: number) {
  p.rect(0, 0, S, S, base);
  p.hline(0, 0, S - 1, light).vline(0, 0, S - 1, light);
  p.vline(S - 1, 0, S, grout).hline(0, S - 1, S, grout);
}

/** A thin crooked line of pixels (cracks, scuffs). */
function crack(p: Pix, seed: number, x: number, y: number, steps: number, c: Color, dx = 1) {
  const r = rng(seed);
  for (let i = 0; i < steps; i++) {
    p.set(x, y, c);
    if (r() < 0.6) x += dx;
    else y += 1;
    if (r() < 0.25) y += r() < 0.5 ? -1 : 1;
  }
}

/** Small square tiles (restrooms): each one lit on its top-left, with light grout between them. */
function smallTiles(p: Pix, size: number, base: number, light: number, grout: number) {
  p.rect(0, 0, S, S, base);
  for (let ty = 0; ty < S; ty += size) {
    for (let tx = 0; tx < S; tx += size) {
      p.hline(tx, ty, size - 1, light).vline(tx, ty, size - 1, light);
      p.vline(tx + size - 1, ty, size, grout).hline(tx, ty + size - 1, size, grout);
    }
  }
}

// ---------------------------------------------------------------- floors

const ASPHALT = 0x6b6f77;
function asphalt(p: Pix, seed: number) {
  p.rect(0, 0, S, S, ASPHALT);
  speckle(p, seed, 26, [0x60646c, 0x60646c, 0x777b83, 0x585c63]);
}

/** One painter per floor char; `v` is the version (see FLOOR_VARIANTS in autotile.ts). */
const FLOOR_ART: Record<string, (p: Pix, v: number) => void> = {
  // Hallway: big cream tiles, like the concept art.
  '.': (p, v) => {
    slab(p, 0xf2e8c9, 0xfaf4e0, 0xd9caa3);
    speckle(p, 3, 4, [0xe8dcb9], [1, 1, 14, 14]);
    if (v === 1) {
      // Scuff marks from sneakers.
      p.hline(3, 10, 4, 0xdfd1ae).hline(9, 5, 3, 0xdfd1ae).set(8, 11, 0xd8c9a4);
    } else if (v === 2) {
      // A hairline crack running in from the grout.
      p.set(11, 14, 0xd6c69e).set(11, 13, 0xd6c69e).set(12, 12, 0xd6c69e).set(12, 11, 0xdfd0ac).set(13, 10, 0xdfd0ac);
    }
    else if (v === 3) speckle(p, 33, 7, [0xd4c39b, 0xdfd0ab], [8, 8, 6, 6]);
  },
  // Classrooms: warm honey-coloured wood planks.
  ',': (p, v) => {
    const planks = [0xe0b479, 0xd7aa6d, 0xddb075, 0xd3a568];
    const joints = [4, 11, 1, 8];
    planks.forEach((c, i) => {
      p.rect(0, i * 4, S, 3, c).hline(0, i * 4 + 3, S, 0xb88850);
      p.vline(joints[i], i * 4, 3, 0xbf8f57);
      speckle(p, 40 + i, 2, [shade(c, 0.07)], [0, i * 4, S, 3]);
    });
    if (v === 1) p.rect(9, 5, 2, 1, 0xa87a46).set(8, 5, 0xc4935b).set(11, 5, 0xc4935b);
  },
  // Restrooms: small tiles with light grout.
  '~': (p) => smallTiles(p, 8, 0x93c2e4, 0xb1d6f0, 0xe0f0fa),
  '^': (p) => smallTiles(p, 8, 0xefa6ba, 0xf6c3d1, 0xfbe1e9),
  // Boiler room: cool grey concrete slabs.
  b: (p, v) => {
    slab(p, 0x9198a1, 0x9ca3ab, 0x7c838c);
    speckle(p, 5, 10, [0x868d96, 0x9fa6ae, 0x80878f], [1, 1, 14, 14]);
    if (v === 1) p.ellipse(4, 5, 8, 6, 0x80868e).ellipse(6, 6, 4, 3, 0x737981); // oil stain
    else if (v === 2) {
      // Floor drain.
      p.rect(5, 5, 6, 6, 0xa9afb6).rect(6, 6, 4, 4, 0x4d535b);
      p.vline(7, 6, 4, 0x6e747c).vline(9, 6, 4, 0x6e747c);
    } else if (v === 3) crack(p, 17, 1, 9, 13, 0x6f757d);
  },
  // Janitor's closet: warmer concrete, sometimes a puddle.
  j: (p, v) => {
    slab(p, 0xaba394, 0xb5ad9f, 0x938b7d);
    speckle(p, 6, 9, [0x9f9788, 0xb8b0a2], [1, 1, 14, 14]);
    if (v === 1) p.ellipse(3, 6, 9, 5, 0x9fb2bd).ellipse(4, 7, 4, 2, 0xc9d9e2);
  },
  // Mr. Gravy's office: dark red carpet with a small pattern.
  o: (p, v) => {
    p.rect(0, 0, S, S, 0xa65b59);
    for (let y = 0; y < S; y += 4) {
      for (let x = 0; x < S; x += 4) {
        p.set(x + 1, y + 1, 0xb96d69);
        p.set(x + 3, y + 3, 0x934c4b);
      }
    }
    if (v === 1) speckle(p, 8, 6, [0xb4645f, 0x9a5250]);
  },
  // Parking lot.
  p: (p, v) => {
    asphalt(p, 9 + v);
    if (v === 1) {
      crack(p, 51, 1, 3, 12, 0x4d5158);
      crack(p, 52, 7, 6, 5, 0x4d5158);
    } else if (v === 2) p.ellipse(3, 4, 10, 7, 0x5d6168).ellipse(5, 5, 5, 4, 0x53575e);
    else if (v === 3) speckle(p, 53, 5, [0x8b8f96, 0x9a9ea4], [2, 2, 12, 12]);
  },
  // Parking line: worn white paint down the middle of a cell (ends where the line stops).
  '|': (p, v) => {
    asphalt(p, 9);
    const top = v & 1 ? 2 : 0;
    const bottom = v & 2 ? 13 : S;
    p.rect(7, top, 2, bottom - top, 0xeeede4);
    speckle(p, 61, 3, [0xc9c8c0], [7, top, 2, bottom - top]);
  },
  // Sidewalk: light concrete slabs.
  _: (p, v) => {
    slab(p, 0xd5d0c5, 0xe3dfd6, 0xb2ac9f);
    speckle(p, 12, 6, [0xc8c2b6, 0xdcd8cf], [1, 1, 14, 14]);
    if (v === 1) crack(p, 13, 3, 2, 12, 0xaaa496);
  },
  // Grass: bright green with tufts; some cells have flowers.
  g: (p, v) => {
    p.rect(0, 0, S, S, 0x74c457);
    const tuft = (x: number, y: number) => p.set(x, y, 0x5aa845).set(x + 2, y, 0x5aa845).set(x + 1, y + 1, 0x5aa845).set(x + 1, y - 1, 0x8ed872);
    const r = rng(70 + v);
    for (let i = 0; i < (v === 1 ? 6 : 3); i++) tuft(1 + Math.floor(r() * 12), 2 + Math.floor(r() * 12));
    const flower = (x: number, y: number, petal: number) => {
      p.set(x, y - 1, petal).set(x - 1, y, petal).set(x + 1, y, petal).set(x, y + 1, petal).set(x, y, 0xf8e070);
      p.set(x, y + 2, 0x4e9a3e);
    };
    if (v === 2) {
      flower(4, 5, 0xf06a6a);
      flower(11, 10, 0xffffff);
    } else if (v === 3) {
      flower(10, 4, 0xf8d040);
      flower(5, 11, 0xf06a6a);
    }
  },
  // Lobby: terrazzo with coloured chips.
  '=': (p, v) => {
    slab(p, 0xe6dfd1, 0xefe9de, 0xd6cdbc);
    speckle(p, 80 + v, 9, [0xc9bead, 0xc49579, 0x9fbcb8, 0xf7f3ea], [1, 1, 14, 14]);
  },
  // Storage: plywood sheets with nails in the corners.
  k: (p, v) => {
    slab(p, 0xd7b07b, 0xe0bb88, 0xa7814e);
    const r = rng(90 + v);
    for (let y = 2; y < 14; y += 3) {
      let x = Math.floor(r() * 4);
      while (x < 14) {
        const len = 2 + Math.floor(r() * 4);
        p.hline(x + 1, y + (r() < 0.5 ? 0 : 1), len, 0xc69d68);
        x += len + 2;
      }
    }
    for (const [x, y] of [
      [1, 1],
      [13, 1],
      [1, 13],
      [13, 13],
    ]) p.set(x, y, 0x8a6a42);
    if (v === 1) p.ellipse(8, 6, 3, 2, 0xb48a55);
  },
  // Teachers' lounge: retro checkerboard linoleum.
  n: (p) => {
    p.rect(0, 0, S, S, 0xe8e2c8);
    p.rect(8, 0, 8, 8, 0xb9d1a7).rect(0, 8, 8, 8, 0xb9d1a7);
  },
};

function paintFloor(f: FloorFrame): Pix {
  const p = new Pix(S, S);
  const art = FLOOR_ART[f.char];
  if (art) art(p, f.variant);
  else missing(p);
  // Walls cast a short flat shadow down and to the right (light comes from the top-left).
  if (f.shadeTop) p.rect(0, 0, S, 3, alpha(SHADOW, 0.2));
  if (f.shadeLeft) p.rect(0, f.shadeTop ? 3 : 0, 2, f.shadeTop ? S - 3 : S, alpha(SHADOW, 0.14));
  return p;
}

// ---------------------------------------------------------------- walls

interface WallLook {
  /** The top of the wall seen from above. */
  cap: number;
  /** Highlight along the cap's lit (top / left) edges. */
  capLight: number;
  /** The dark line where the wall ends. Not black: a deep shade of the wall's own colour. */
  edge: number;
  /** Optional texture on the cap (bricks), drawn over rows y..y+h. */
  capPattern?: (p: Pix, y: number, h: number) => void;
  /** Paints the wall's front from row STRIP + 1 down to the floor. */
  face: (p: Pix, f: WallFrame) => void;
}

/** Painted cinder blocks: pale, staggered blocks, a shadow under the cap and a brown baseboard. */
function cinderFace(p: Pix, f: WallFrame) {
  const top = STRIP + 1;
  p.rect(0, top, S, S - top, 0xe7ead3);
  p.hline(0, top, S, 0xd3d7bf); // under the cap's overhang
  for (const [y, joints] of [
    [7, [4, 12]],
    [10, [0, 8]],
    [13, [4, 12]],
  ] as const) {
    p.hline(0, y, S, 0xd5d9c2);
    for (const x of joints) p.vline(x, y - 2, 2, 0xd5d9c2);
  }
  p.hline(0, 14, S, 0x9c8a73).hline(0, 15, S, 0x7a6955);
  if (f.left === 'open') p.vline(1, top + 1, 13 - top, 0xf2f4e4);
  if (f.right === 'open') p.vline(14, top + 1, 13 - top, 0xd2d5bf);
}

/** A whiteboard on the cinder blocks, with a marker tray and a few scribbles (3 versions). */
function whiteboardFace(p: Pix, f: WallFrame) {
  cinderFace(p, f);
  p.rect(2, 5, 12, 7, 0xa9b1bb); // aluminium frame
  p.rect(3, 6, 10, 5, 0xf8fbff);
  p.hline(3, 6, 10, 0xffffff);
  p.hline(2, 12, 12, 0x7f8894); // marker tray
  p.set(4, 11, 0xe04848).set(6, 11, 0x3a6fd8).set(7, 11, 0x2e3440);
  const blue = 0x3a6fd8;
  const red = 0xe04848;
  const green = 0x3a9a5a;
  if (f.variant === 0) {
    p.hline(4, 7, 5, blue).hline(4, 9, 7, blue).hline(10, 7, 2, red);
  } else if (f.variant === 1) {
    // A little graph going up.
    p.set(4, 10, green).set(5, 9, green).set(6, 9, green).set(7, 8, green).set(8, 8, green).set(9, 7, green).set(10, 7, green).set(11, 6, red);
  } else {
    p.hline(4, 7, 3, red).set(8, 7, red).hline(4, 9, 4, blue).hline(9, 9, 3, blue);
  }
}

/** Bricks in rows `y0..y1`: 3-pixel-tall bricks with a lit top row and staggered joints. */
function bricks(p: Pix, y0: number, y1: number, base: number, light: number, mortar: number, offset = 0) {
  p.rect(0, y0, S, y1 - y0, base);
  for (let y = y0; y < y1; y++) {
    const row = y - y0 + offset;
    const band = Math.floor(row / 4);
    if (row % 4 === 3) p.hline(0, y, S, mortar);
    else {
      if (row % 4 === 0) p.hline(0, y, S, light);
      for (let x = band % 2 ? 3 : 7; x < S; x += 8) p.set(x, y, mortar);
    }
  }
}

function brickFace(p: Pix, f: WallFrame) {
  const top = STRIP + 1;
  bricks(p, top, 14, 0xc35b3f, 0xd57154, 0x8f3d2b);
  if (f.variant === 1) {
    // A few weathered bricks.
    p.rect(8, 5, 6, 2, 0xab4a33).rect(0, 9, 3, 2, 0xab4a33);
  }
  p.hline(0, 14, S, 0x86392a).hline(0, 15, S, 0x642a1f);
  if (f.right === 'open') p.vline(14, top, 10, 0xa84d36);
}

const WALL_LOOKS: Record<string, WallLook> = {
  '#': { cap: 0xc9bea4, capLight: 0xddd4bd, edge: 0x4f4236, face: cinderFace },
  W: { cap: 0xc9bea4, capLight: 0xddd4bd, edge: 0x4f4236, face: whiteboardFace },
  B: {
    cap: 0xa04b39,
    capLight: 0xb75e47,
    edge: 0x4a1d15,
    capPattern: (p, y, h) => bricks(p, y, y + h, 0xa04b39, 0xad5541, 0x873b2c),
    face: brickFace,
  },
};

function paintSolidWall(f: WallFrame, look: WallLook): Pix {
  const p = new Pix(S, S);
  const capRows = f.part === 'top' ? S : STRIP;
  p.rect(0, 0, S, capRows, look.cap);
  look.capPattern?.(p, 0, capRows);
  if (f.part === 'face') {
    p.hline(0, STRIP, S, look.edge);
    look.face(p, f);
  }
  const dark = shade(look.cap, 0.1);
  if (f.openTop) p.hline(0, 0, S, look.edge).hline(1, 1, S - 2, look.capLight);
  const side = (x: number, inner: number, s: WallSide, lit: boolean) => {
    if (s === 'open') {
      p.vline(x, 0, S, look.edge);
      p.vline(inner, f.openTop ? 1 : 0, capRows - (f.openTop ? 1 : 0), lit ? look.capLight : dark);
    } else if (s === 'face') {
      // The wall beside this cap is a front: the cap's side edge runs down past it.
      p.vline(x, STRIP, S - STRIP, look.edge);
      p.vline(inner, STRIP + 1, S - STRIP - 1, lit ? look.capLight : dark);
    }
  };
  side(0, 1, f.left, true);
  side(S - 1, S - 2, f.right, false);
  if (f.cornerLeft) p.set(0, 0, look.edge);
  if (f.cornerRight) p.set(S - 1, 0, look.edge);
  return p;
}

// Chain-link fence on posts, drawn over the floor (the floor layer shows through).
const POST = 0x87919c;
const POST_LIGHT = 0xc3cad2;
const RAIL = 0xa3acb6;
const RAIL_DARK = 0x6f7883;
const FENCE_OUT = 0x3d444e;
const MESH = alpha(0x8d97a2, 0.85);

function paintFence(f: WallFrame): Pix {
  const p = new Pix(S, S);
  /** The fence seen from the front between columns x0..x1: top rail, diamond mesh, bottom rail, shadow. */
  const run = (x0: number, x1: number) => {
    for (let y = 4; y < 14; y++) for (let x = x0; x <= x1; x++) if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) p.set(x, y, MESH);
    p.hline(x0, 3, x1 - x0 + 1, RAIL).hline(x0, 2, x1 - x0 + 1, FENCE_OUT);
    p.hline(x0, 14, x1 - x0 + 1, RAIL_DARK);
    p.hline(x0, 15, x1 - x0 + 1, alpha(SHADOW, 0.2));
  };
  /** The fence seen from above, running down the screen between rows y0..y1. */
  const line = (y0: number, y1: number) => {
    p.vline(6, y0, y1 - y0 + 1, FENCE_OUT).vline(9, y0, y1 - y0 + 1, FENCE_OUT);
    p.vline(7, y0, y1 - y0 + 1, RAIL).vline(8, y0, y1 - y0 + 1, RAIL_DARK);
    p.vline(10, y0, y1 - y0 + 1, alpha(SHADOW, 0.2));
  };
  const post = (y0: number, y1: number) => {
    p.rect(6, y0, 4, y1 - y0 + 1, FENCE_OUT);
    p.vline(7, y0 + 1, y1 - y0 - 1, POST_LIGHT).vline(8, y0 + 1, y1 - y0 - 1, POST);
  };
  const leftJoined = f.left !== 'open';
  const rightJoined = f.right !== 'open';
  if (f.part === 'face') {
    if (leftJoined || rightJoined) run(leftJoined ? 0 : 8, rightJoined ? S - 1 : 7);
    if (!f.openTop) line(0, 2);
    post(1, 15);
  } else {
    if (leftJoined) run(0, 7);
    if (rightJoined) run(8, S - 1);
    line(f.openTop ? 5 : 0, S - 1);
    post(5, 10);
  }
  return p;
}

function paintWall(f: WallFrame): Pix {
  if (f.char === 'F') return paintFence(f);
  const look = WALL_LOOKS[f.char];
  if (!look) return missing(new Pix(S, S));
  return paintSolidWall(f, look);
}

// ---------------------------------------------------------------- the tileset

/** Loud checkerboard for a tile nobody drew yet (the unit tests also complain). */
function missing(p: Pix): Pix {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 0xff00ff : 0x202020);
  return p;
}

/** True when the tile with map character `ch` has real art here. */
export function hasTileArt(ch: string): boolean {
  return ch in FLOOR_ART || ch in WALL_LOOKS || ch === 'F';
}

/** One frame of the tileset, 16x16 art pixels. */
export function paintTileFrame(f: TileFrame): Pix {
  return f.kind === 'floor' ? paintFloor(f) : paintWall(f);
}

/** Every frame laid out in a grid, each one padded with copies of its own edge pixels (no seams). */
export function tilesetPix(): Pix {
  const block = S + TILESET_PAD * 2;
  const rows = Math.ceil(TILE_FRAMES.length / TILESET_COLUMNS);
  const sheet = new Pix(TILESET_COLUMNS * block, rows * block);
  TILE_FRAMES.forEach((f, i) => {
    const pix = paintTileFrame(f);
    const ox = (i % TILESET_COLUMNS) * block + TILESET_PAD;
    const oy = Math.floor(i / TILESET_COLUMNS) * block + TILESET_PAD;
    for (let y = -TILESET_PAD; y < S + TILESET_PAD; y++) {
      for (let x = -TILESET_PAD; x < S + TILESET_PAD; x++) {
        const v = pix.data[Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))];
        sheet.data[(oy + y) * sheet.w + ox + x] = v;
      }
    }
  });
  return sheet;
}

export const tileArt: ArtModule = {
  keys: () => [TILESET_TEXTURE],
  paint: (textures: Phaser.Textures.TextureManager) => {
    const tex = addTexture(textures, TILESET_TEXTURE, tilesetPix());
    // Named frames ("floor g 2 --", "wall # face 0 n--..") for images such as the editor's palette icons.
    TILE_FRAMES.forEach((f, i) => {
      const r = frameRect(i);
      tex.add(frameName(f), 0, r.x, r.y, r.w, r.h);
    });
  },
};
