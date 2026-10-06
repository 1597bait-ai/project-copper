// Fixtures, decorations, doors, the van and the "you can scrap this" markers, as pixel art
// (Pokemon Gen 3 style: seen from above at an angle, facing the camera, 1px dark outline, flat
// shades lit from the top-left). The shadow and scrap sack are in characters.ts.
//
// Placement (src/world/World.ts): every image stands with its bottom edge on the bottom of the
// cells it covers, centred, so tall things (lamps, trees, wall-mounted panels) reach up over
// the tile above. Wall-mounted fixtures have a front view (wall above them) and a side view
// `${id}_side` drawn against a wall on the left (mirrored for a wall on the right).

import type Phaser from 'phaser';
import type { ArtModule } from './index';
import { PX, Pix, addSheet, addTexture, alpha, fromRows, mix, shade, type Color } from './pixel';

/** Outline for objects: dark navy, not black. */
const OUT = 0x283040;
const SHADOW = 0x2a2238;

const STEEL_HI = 0xf2f5f8;
const STEEL_L = 0xd9e0e6;
const STEEL = 0xb9c3cc;
const STEEL_D = 0x8e99a5;
const STEEL_DD = 0x66717d;
const COPPER_HI = 0xffd9a8;
const COPPER_L = 0xf3a463;
const COPPER = 0xd7773b;
const COPPER_D = 0xa0532a;
const COPPER_DD = 0x6e3618;
const BRASS_L = 0xf7dd84;
const BRASS = 0xd9b13f;
const BRASS_D = 0xa07c22;
const PORCELAIN_HI = 0xffffff;
const PORCELAIN = 0xeef2f6;
const PORCELAIN_D = 0xc9d3dc;
const PORCELAIN_DD = 0x9aa8b6;
const WATER = 0xa6d4ef;
const WATER_D = 0x7fb6dc;

// ---------------------------------------------------------------- helpers

/** Draws `c` only where the image is still empty (shadows go under things). */
function under(p: Pix, x: number, y: number, w: number, h: number, c: Color, round = true) {
  const tmp = new Pix(p.w, p.h);
  if (round) tmp.ellipse(x, y, w, h, 0xffffff);
  else tmp.rect(x, y, w, h, 0xffffff);
  for (let i = 0; i < p.data.length; i++) if (tmp.data[i] && !p.data[i]) p.set(i % p.w, Math.floor(i / p.w), c);
}

/** Outline plus a soft shadow on the floor under the bottom of the image. */
function finish(p: Pix, shadow?: [number, number, number, number]): Pix {
  p.outline(OUT);
  if (shadow) under(p, ...shadow, alpha(SHADOW, 0.28));
  return p;
}

/** ASCII art on an image of a given size (rows may be shorter than the image). */
function art(w: number, h: number, rows: readonly string[], palette: Record<string, Color>, dx = 0, dy = 0): Pix {
  return new Pix(w, h).rows(rows, palette, dx, dy);
}

// ---------------------------------------------------------------- fixtures

/** Drinking fountain: steel basin on a wall plate, push button, copper pipes underneath. */
function fountain(side: boolean): Pix {
  const pal = { a: STEEL_L, b: STEEL, c: STEEL_D, d: STEEL_DD, h: STEEL_HI, w: WATER, x: WATER_D, k: 0x4f8ad8, p: COPPER, q: COPPER_D, s: 0x5d6873 };
  const rows = side
    ? [
        '.cc.............',
        '.bbs............',
        '.bbd............',
        '.hhhhhhhhh......',
        '.abxxxxxxba.....',
        '.abxwwwwwxa.....',
        '.abxwhswwxa.....',
        '.abbxxxxxba.....',
        '.aaaaaaaaaa.....',
        '.bbbbbbbbkb.....',
        '.bbbbbbbbkb.....',
        '.cccccccccc.....',
        '..dddddddd......',
        '.pq.............',
        '.pq.............',
      ]
    : [
        '...cccccccccc...',
        '...bbbbsbbbbb...',
        '...bbbbdbbbbb...',
        '..hhhhhhhhhhhh..',
        '..abbxxxxxxbba..',
        '..abxwwwwwwxba..',
        '..abxwwhswwxba..',
        '..abbxxxxxxbba..',
        '..aaaaaaaaaaaa..',
        '..bbbbbbbbbbkb..',
        '..bbbbbbbbbbkb..',
        '..cccccccccccc..',
        '...dddddddddd...',
        '.....pq..pq.....',
        '.....pq..pq.....',
      ];
  const p = art(16, 20, rows, pal, 0, 2);
  return finish(p, side ? [1, 15, 11, 3] : [2, 15, 12, 3]);
}

/** Radiator: cream cast-iron fins, copper pipe and a brass valve. */
function radiator(side: boolean): Pix {
  const p = new Pix(16, 18);
  const light = 0xf3eddf;
  const mid = 0xd9d0bb;
  const dark = 0xb0a68e;
  if (!side) {
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 3;
      p.vline(x, 4, 9, light).vline(x + 1, 4, 9, mid);
      p.set(x, 3, mid).set(x + 1, 3, mid);
      if (i < 3) p.vline(x + 2, 5, 8, dark);
    }
    p.hline(3, 12, 11, dark).hline(3, 13, 11, mix(dark, OUT, 0.3));
    p.set(4, 14, dark).set(12, 14, dark);
    // Copper supply pipe with a brass valve on the left.
    p.vline(1, 6, 9, COPPER).vline(2, 9, 6, COPPER_D).set(1, 6, COPPER_L).set(1, 7, COPPER_L);
    p.rect(1, 9, 2, 2, BRASS).set(1, 9, BRASS_L).set(0, 8, BRASS_D).set(1, 8, BRASS);
    return finish(p, [1, 13, 14, 3]);
  }
  // From the end: one deep fin against the left wall.
  p.rect(1, 3, 6, 10, mid);
  for (let y = 4; y < 12; y += 2) p.hline(2, y, 5, light);
  p.hline(1, 3, 6, light).hline(1, 12, 6, dark).hline(1, 13, 6, mix(dark, OUT, 0.3));
  p.vline(7, 5, 8, COPPER).vline(8, 9, 5, COPPER_D).set(7, 5, COPPER_L);
  p.rect(7, 9, 2, 2, BRASS).set(7, 9, BRASS_L);
  return finish(p, [1, 13, 10, 3]);
}

/** School toilet: no tank, a flush valve (brass) on the wall, white bowl and seat. */
function toilet(side: boolean): Pix {
  const pal = { k: STEEL_L, K: STEEL_HI, m: STEEL_D, b: BRASS, B: BRASS_L, n: BRASS_D, w: PORCELAIN_D, W: PORCELAIN, H: PORCELAIN_HI, s: WATER, S: WATER_D, p: PORCELAIN_DD };
  const rows = side
    ? [
        '.kK.............',
        '.Bb.............',
        '.nbkkk..........',
        '.wwwwwwwww......',
        '.wHHHHHHHWw.....',
        '.wHSSSSSSSWw....',
        '.wHssssssSWW....',
        '.wHSssssSSWw....',
        '.wWWWWWWWWw.....',
        '.pppppppppp.....',
        '.wppppppppp.....',
        '..pppppp........',
        '..wpppp.........',
      ]
    : [
        '.....kkKkk......',
        '.....KBbbK......',
        '......nbn.......',
        '.......k........',
        '....wwwwwwww....',
        '...wHHHHHHHHw...',
        '...wHSSSSSSWw...',
        '..wHSsssssSSWw..',
        '..wHSssssssSWw..',
        '..wHWSsssSSWWw..',
        '...wWWWWWWWWw...',
        '...pppppppppp...',
        '....pppppppp....',
        '.....wppppp.....',
        '.....wppppp.....',
      ];
  const p = art(16, 20, rows, pal, 0, side ? 4 : 2);
  return finish(p, side ? [1, 15, 12, 4] : [3, 15, 10, 4]);
}

/** Mop sink: a low square basin on the floor, a brass faucet on the wall, a mop leaning in it. */
function mopSink(side: boolean): Pix {
  const pal = { b: BRASS, B: BRASS_L, n: BRASS_D, r: 0xc2c9cf, R: 0xe1e6ea, i: 0x7e8a95, I: 0x66727e, d: 0x3f4852, f: 0xa3acb5, g: 0x858f99, h: 0x4b7fae };
  const rows = side
    ? [
        '.B..............',
        '.bbbb...........',
        '.n..b...........',
        '....h...........',
        '.rrrrrrrrrr.....',
        '.rRRRRRRRRRr....',
        '.rRIIIIIIIRr....',
        '.rRIiiiiiiRr....',
        '.rRIiiddiiRr....',
        '.rRIiiiiiiRr....',
        '.rRRRRRRRRRr....',
        '.fffffffffff....',
        '.ggggggggggg....',
      ]
    : [
        '...B.....B......',
        '...bbbbbbbb.....',
        '...n..bb..n.....',
        '......bh........',
        '..rrrrrrrrrrrr..',
        '..rRRRRRRRRRRr..',
        '..rRIIIIIIIIRr..',
        '..rRIiiiiiiiRr..',
        '..rRIiiddiiiRr..',
        '..rRIiiiiiiiRr..',
        '..rRRRRRRRRRRr..',
        '..ffffffffffff..',
        '..gggggggggggg..',
      ];
  const p = art(16, 18, rows, pal, 0, 2);
  // The mop: a wooden handle leaning on the wall, its grey head in the basin.
  const handle = side ? [9, 10, 10, 11, 11, 12, 12, 13] : [11, 11, 12, 12, 13, 13, 14, 14];
  handle.forEach((x, i) => p.set(x, 10 - i, 0xd9a25e).set(x, 11 - i, 0xa8763c));
  const mx = side ? 7 : 9;
  p.rect(mx, 9, 4, 2, 0xe6e2d6).set(mx, 11, 0xbdb7a8).set(mx + 2, 11, 0xbdb7a8).set(mx + 1, 9, 0xffffff);
  return finish(p, side ? [1, 14, 13, 3] : [2, 14, 13, 3]);
}

/** Breaker panel with its cover off: rows of breakers and bright copper bus bars. Hangs high on the wall. */
function electricPanel(side: boolean): Pix {
  const p = new Pix(16, 24);
  const top = 0xc6ced6;
  const face = 0x9aa5b0;
  const faceD = 0x7d8893;
  const cavity = 0x343c48;
  if (!side) {
    p.rect(7, 0, 2, 3, STEEL_D).vline(7, 0, 3, STEEL_L); // conduit into the wall
    p.rect(3, 3, 10, 2, top);
    p.rect(3, 5, 10, 14, face);
    p.vline(3, 5, 14, 0xb3bdc7).hline(3, 18, 10, faceD);
    p.rect(4, 6, 8, 11, cavity);
    // Copper bus bars down the middle, breakers either side.
    p.vline(7, 6, 11, COPPER_L).vline(8, 6, 11, COPPER);
    p.set(7, 7, COPPER_HI).set(7, 8, COPPER_HI).set(8, 16, COPPER_D);
    for (let y = 7; y < 16; y += 2) {
      p.hline(5, y, 2, 0x1e232b).set(5, y, 0xe8ecf0);
      p.hline(9, y, 2, 0x1e232b).set(10, y, 0xe8ecf0);
    }
    p.set(10, 15, 0xf2c232).set(11, 15, 0x1e232b); // warning sticker
    // The door hangs open on the right.
    p.vline(13, 5, 13, 0xb3bdc7).vline(14, 6, 11, faceD);
    return finish(p, [3, 20, 12, 3]);
  }
  // Side view against the left wall: a slim box, its open door swung out showing the copper.
  p.rect(1, 3, 4, 2, top);
  p.rect(1, 5, 4, 14, face);
  p.vline(4, 6, 12, COPPER).vline(4, 7, 3, COPPER_L).hline(1, 18, 4, faceD);
  p.rect(5, 6, 4, 11, 0xb3bdc7);
  p.vline(8, 6, 11, faceD);
  p.rect(6, 8, 2, 3, 0xf4f1e6).set(6, 13, 0xf2c232);
  return finish(p, [1, 20, 10, 3]);
}

/** A school desk (wood top, metal legs) with its orange chair pulled in front. */
function desk(): Pix {
  const pal = {
    t: 0xc99a5b,
    T: 0xe8c48c,
    L: 0xf3d9ac,
    e: 0xb08048,
    a: 0x8a6538,
    l: STEEL_DD,
    o: 0xe8823a,
    O: 0xf6a35c,
    q: 0xb85f22,
    s: STEEL_D,
    w: 0xffffff,
    x: 0xc8d2dc,
    y: 0xf2c232,
  };
  const rows = [
    '..tttttttttttt..',
    '..tLLLLLLLLLLt..',
    '..tTTwwwTTTTTt..',
    '..tTTwxwTTyTTt..',
    '..tTTwwwTTTyTt..',
    '..eeeeeeeeeeee..',
    '..aaaaaaaaaaaa..',
    '...l........l...',
    '...l.OOOOOO.l...',
    '...l.oooooo.l...',
    '....qooooooq....',
    '.....qqqqqq.....',
    '.....s....s.....',
    '.....s....s.....',
  ];
  return finish(art(16, 18, rows, pal, 0, 2), [3, 15, 10, 3]);
}

/** Floor lamp: cream shade, brass pole, round base. Taller than a tile. */
function lamp(): Pix {
  const pal = { s: 0xf6e7b8, S: 0xfff6d8, d: 0xd9c48e, b: BRASS, B: BRASS_L, n: BRASS_D, k: 0x6c5a3a, g: alpha(0xfff2b0, 0.45) };
  const rows = [
    '.....ssss.......',
    '....SSssss......',
    '....Sssssss.....',
    '...Sssssssss....',
    '...sssssssss....',
    '...ddddddddd....',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '......Bb........',
    '....nBBbbn......',
    '...knnnnnnk.....',
  ];
  const p = art(16, 26, rows, pal, 1, 3);
  return finish(p, [3, 21, 11, 3]);
}

/** A heap of bare bright copper: a coil of wire and shiny pipes. It should look worth the trip. */
function copperPile(): Pix {
  const p = new Pix(16, 16);
  /** Each piece gets its own dark copper outline, so the pile reads as separate pieces. */
  const piece = (draw: (q: Pix) => void) => {
    const q = new Pix(16, 16);
    draw(q);
    p.draw(q.outline(COPPER_DD));
  };
  // Coil of wire at the back: a ring, lit along its top.
  piece((q) => {
    q.ellipse(6, 1, 9, 7, COPPER);
    q.ellipse(6, 1, 9, 4, COPPER_L).ellipse(7, 2, 5, 2, COPPER_HI);
    const hole = new Pix(16, 16).ellipse(8, 3, 5, 3, 0xffffff);
    for (let i = 0; i < q.data.length; i++) if (hole.data[i]) q.data[i] = 0;
    q.hline(9, 7, 4, COPPER_D);
  });
  /** A pipe lying across: lit top with a shine, dark underside, open end on the right. */
  const pipeAt = (x: number, y: number, len: number) =>
    piece((q) => {
      q.hline(x, y, len, COPPER_L).hline(x, y + 1, len, COPPER).hline(x, y + 2, len, COPPER_D);
      q.hline(x + 1, y, Math.min(3, len - 2), COPPER_HI);
      q.vline(x + len, y, 3, COPPER_L).set(x + len, y + 1, 0x4a2410);
    });
  pipeAt(1, 6, 9);
  pipeAt(4, 9, 10);
  pipeAt(2, 12, 7);
  finish(p, [1, 13, 15, 3]);
  // Sparkles on top (after the outline so they stay crisp).
  const glint = alpha(0xfff6d0, 0.85);
  for (const [x, y] of [
    [3, 5],
    [13, 4],
  ]) p.set(x, y, 0xffffff).set(x - 1, y, glint).set(x + 1, y, glint).set(x, y - 1, glint).set(x, y + 1, glint);
  return p;
}

// ---------------------------------------------------------------- decorations

function plant(): Pix {
  const pal = { g: 0x4f9e44, G: 0x6cc35a, H: 0x8fdc72, d: 0x3a7a37, t: 0xc8683a, T: 0xe08752, r: 0x9c4b28, s: 0x6b3a22 };
  const rows = [
    '......G.........',
    '...G..GH..G.....',
    '...GG.gGHGG.....',
    '..dGGHgGHGg.G...',
    '.dgGGgggGGgGG...',
    '.dgggdgGgggGgd..',
    '..ddgdggdggdgd..',
    '...ddgdgdgdd....',
    '....dddddd......',
    '...TTTTTTTTT....',
    '...ttttttttt....',
    '....tttttttr....',
    '....ttttttrr....',
    '.....trrrrr.....',
    '.....sssss......',
  ];
  return finish(art(16, 20, rows, pal, 1, 3), [3, 16, 11, 3]);
}

function trashCan(): Pix {
  const pal = { a: 0xb4c4d2, b: 0x8fa3b5, c: 0x6f8396, d: 0x56687a, k: 0x2f3842, p: 0xf2efe6, P: 0xd6d0c2 };
  const rows = [
    '...aaaaaaaaa....',
    '..abbbbbbbbba...',
    '..abkkkkkkkba...',
    '..abkkppkkkba...',
    '..aaaaaaaaaaa...',
    '...bcbcbcbcb....',
    '...bcbcbcbcb....',
    '...bcbcbcbcb....',
    '...bcbcbcbcb....',
    '...bcbcbcbcb....',
    '...ddddddddd....',
  ];
  return finish(art(16, 16, rows, pal, 1, 3), [3, 13, 11, 3]);
}

/** A round leafy tree: canopy overhangs the tile above, trunk stands in its own tile. */
function tree(): Pix {
  const p = new Pix(24, 32);
  const dark = 0x2f7a3a;
  const mid = 0x47a24a;
  const light = 0x6cc35a;
  const hi = 0x98e07a;
  // Trunk.
  p.rect(10, 20, 4, 9, 0x8a5a32).vline(10, 20, 9, 0xa8723f).vline(13, 21, 8, 0x6a4022);
  p.set(9, 28, 0x8a5a32).set(14, 28, 0x6a4022);
  // Canopy: overlapping blobs, dark at the bottom right, light at the top left.
  p.ellipse(2, 6, 20, 17, dark);
  p.ellipse(3, 3, 17, 16, mid);
  p.ellipse(4, 2, 12, 11, light);
  p.ellipse(6, 3, 6, 5, hi);
  // Leaf clumps: little highlight and shadow marks.
  for (const [x, y] of [
    [15, 7],
    [8, 13],
    [15, 14],
    [5, 9],
  ]) p.set(x, y, dark).set(x + 1, y, dark).set(x, y - 1, light);
  for (const [x, y] of [
    [11, 5],
    [7, 7],
  ]) p.set(x, y, hi);
  p.outline(0x22402a);
  under(p, 4, 26, 17, 5, alpha(SHADOW, 0.3));
  return p;
}

interface CarColor {
  key: string;
  body: number;
}

/** Parked car colours. Each comes facing you ('car_blue') and the other way ('car_blue_rear'). */
export const CAR_COLORS: readonly CarColor[] = [
  { key: 'car', body: 0xd9473b },
  { key: 'car_blue', body: 0x3f6fd6 },
  { key: 'car_white', body: 0xe9edf1 },
  { key: 'car_brown', body: 0x8e5b3a },
  { key: 'car_green', body: 0x4a9a5c },
  { key: 'car_yellow', body: 0xe9b93a },
];
/** Every parked car look; each car on the map picks one by where it is (src/world/World.ts). The first is 'car'. */
export const CAR_KEYS = [...CAR_COLORS.map((c) => c.key), ...CAR_COLORS.map((c) => `${c.key}_rear`)];

/** A parked car (2x2 tiles) seen from the front (headlights, grille) or the back (tail lights, number plate). */
function car(body: number, rear = false): Pix {
  const p = new Pix(32, 32);
  const L = shade(body, -0.25);
  const D = shade(body, 0.22);
  const DD = shade(body, 0.42);
  const glass = 0x8fc6e6;
  const glassL = 0xd6efff;
  const glassD = 0x5a86a8;
  // Wheels peeking out under the sides.
  p.rect(3, 22, 4, 8, 0x2a2e36).rect(25, 22, 4, 8, 0x2a2e36);
  // Body.
  p.rect(4, 3, 24, 26, body);
  p.rect(5, 2, 22, 1, body);
  p.vline(4, 6, 22, D).vline(27, 6, 22, DD);
  // The far end and its window, the roof, the near window (windshield or rear window) and the near end.
  p.hline(6, 3, 20, L);
  p.rect(7, 5, 18, 3, glassD);
  p.rect(6, 8, 20, 6, L).hline(6, 13, 20, body);
  p.rect(5, 14, 22, 6, glass);
  p.hline(5, 14, 22, glassD);
  p.set(7, 15, glassL).set(8, 15, glassL).set(7, 16, glassL).set(22, 17, glassL);
  p.vline(5, 14, 6, D).vline(26, 14, 6, D);
  p.rect(5, 20, 22, 4, body).hline(6, 20, 20, L);
  // Front (headlights, grille) or back (tail lights, number plate), then the bumper.
  p.rect(4, 24, 24, 4, D);
  const light = rear ? 0xe8463e : 0xfff3c0;
  p.rect(5, 24, 4, 2, light).rect(23, 24, 4, 2, light);
  if (rear) p.rect(13, 25, 6, 2, 0xf4f0d8).hline(14, 25, 4, 0xf2c232);
  else p.rect(11, 25, 10, 2, 0x3b4048);
  p.rect(4, 28, 24, 2, 0xb9c1c9).hline(4, 29, 24, 0x8a939c);
  // Mirrors.
  p.rect(2, 15, 2, 2, body).rect(28, 15, 2, 2, D);
  p.outline(OUT);
  under(p, 1, 27, 30, 5, alpha(SHADOW, 0.3));
  return p;
}

// ---------------------------------------------------------------- the van (Dalton's white work van)

const VAN_W = 0xf4f6f8;
const VAN_L = 0xffffff;
const VAN_M = 0xdde3e8;
const VAN_D = 0xb6c0c9;
const TYRE = 0x2a2e36;

/** The van from the side, nose to the right (a 4x2 tile block), with a ladder rack on the roof. */
export function vanSide(): Pix {
  const p = new Pix(64, 32);
  // Roof (seen from above) with the ladder rack.
  p.rect(4, 3, 46, 6, VAN_M);
  p.hline(4, 3, 46, VAN_L);
  p.hline(3, 2, 46, STEEL_D).hline(3, 7, 46, STEEL_D);
  for (let x = 6; x < 48; x += 6) p.vline(x, 2, 6, STEEL_DD);
  // Body side.
  p.rect(3, 9, 50, 15, VAN_W);
  p.hline(3, 9, 50, VAN_L);
  p.rect(3, 21, 57, 3, VAN_D);
  // Cab: sloped windshield and a side window, hood down to the bumper.
  p.rect(50, 6, 6, 3, VAN_M);
  for (let i = 0; i < 6; i++) p.hline(53, 9 + i, 4 + i, i < 2 ? VAN_M : VAN_W);
  p.rect(44, 10, 9, 6, 0x8fc6e6).hline(44, 10, 9, 0x5a86a8).set(45, 11, 0xd6efff).set(46, 11, 0xd6efff);
  p.rect(53, 10, 4, 5, 0x5a86a8);
  p.rect(53, 15, 8, 6, VAN_W).hline(53, 15, 8, VAN_L);
  p.set(60, 16, 0xfff3c0).set(60, 17, 0xfff3c0);
  // Panel lines: sliding door, back doors.
  p.vline(24, 10, 11, VAN_D).vline(42, 10, 11, VAN_D).vline(5, 10, 11, VAN_M);
  p.hline(26, 15, 3, STEEL_DD);
  // A copper-coloured stripe and a little "COPPER" badge (a coil).
  p.hline(3, 18, 50, COPPER).hline(3, 19, 50, COPPER_D);
  p.ellipse(12, 12, 6, 5, COPPER_L).ellipse(13, 13, 4, 3, VAN_W);
  // Bumpers.
  p.rect(1, 20, 3, 4, STEEL_DD).rect(60, 19, 3, 4, STEEL_DD);
  // Wheels.
  for (const cx of [14, 49]) {
    p.ellipse(cx - 5, 20, 10, 10, TYRE);
    p.ellipse(cx - 2, 23, 4, 4, 0xa0a8b2);
    p.set(cx - 1, 24, 0x6c747e);
  }
  // Dark wheel arches.
  p.outline(OUT);
  under(p, 1, 27, 63, 5, alpha(SHADOW, 0.3), false);
  return p;
}

/** The van from the front, nose down (a 2x4 tile block): long roof with ladders, windshield, grille. */
export function vanFront(): Pix {
  const p = new Pix(32, 64);
  p.rect(3, 38, 4, 12, TYRE).rect(25, 38, 4, 12, TYRE).rect(3, 52, 4, 8, TYRE).rect(25, 52, 4, 8, TYRE);
  p.rect(4, 2, 24, 58, VAN_W);
  p.vline(4, 6, 54, VAN_M).vline(27, 6, 54, VAN_D);
  // Roof seen from above with the ladder rack along it.
  p.rect(6, 3, 20, 37, VAN_M).hline(6, 3, 20, VAN_L);
  p.vline(7, 3, 36, STEEL_D).vline(24, 3, 36, STEEL_D);
  for (let y = 6; y < 38; y += 5) p.hline(8, y, 16, STEEL_DD);
  // Back of the van is far away: just its top edge.
  p.hline(5, 2, 22, VAN_L);
  // Windshield, hood, front.
  p.rect(6, 41, 20, 7, 0x8fc6e6).hline(6, 41, 20, 0x5a86a8).set(8, 42, 0xd6efff).set(9, 42, 0xd6efff).set(8, 43, 0xd6efff);
  p.rect(5, 48, 22, 5, VAN_W).hline(6, 48, 20, VAN_L);
  p.rect(4, 53, 24, 5, VAN_D);
  p.rect(5, 53, 4, 2, 0xfff3c0).rect(23, 53, 4, 2, 0xfff3c0);
  p.rect(11, 54, 10, 3, 0x3b4048);
  p.hline(4, 56, 24, COPPER).hline(4, 57, 24, COPPER_D);
  p.rect(4, 58, 24, 2, STEEL_DD);
  p.rect(1, 42, 3, 3, VAN_W).rect(28, 42, 3, 3, VAN_D);
  p.outline(OUT);
  under(p, 1, 58, 31, 6, alpha(SHADOW, 0.3), false);
  return p;
}

// ---------------------------------------------------------------- doors

const DOOR = 0x7f93ab;
const DOOR_L = 0xa3b5c9;
const DOOR_D = 0x5f7088;
const JAMB = 0x4a525e;
/** Same as the interior wall's top (src/art/tiles.ts), so a door's lintel lines up with the wall beside it. */
const LINTEL = 0xc9bea4;
const LINTEL_L = 0xddd4bd;
const LINTEL_EDGE = 0x4f4236;

function padlock(p: Pix, cx: number, y: number) {
  p.rect(cx - 2, y, 4, 2, 0x9aa3ad).erase(cx - 1, y + 1).erase(cx, y + 1); // shackle
  p.rect(cx - 3, y + 2, 6, 4, 0xf2c232).hline(cx - 3, y + 2, 6, 0xffe27a).hline(cx - 3, y + 5, 6, 0xb8901e);
  p.set(cx - 1, y + 3, 0x3a2e10).set(cx - 1, y + 4, 0x3a2e10);
  p.box(cx - 4, y + 1, 8, 6, OUT).erase(cx - 4, y + 1).erase(cx + 3, y + 1);
}

/** Lintel strip like the top of the wall around a doorway, then the door frame. */
function doorFrame(p: Pix) {
  p.hline(0, 0, p.w, LINTEL_EDGE).hline(0, 1, p.w, LINTEL_L).hline(0, 2, p.w, LINTEL).hline(0, 3, p.w, LINTEL_EDGE);
  p.rect(0, 4, 2, p.h - 4, JAMB).rect(p.w - 2, 4, 2, p.h - 4, JAMB);
  p.vline(1, 4, p.h - 4, 0x67707c);
}

/** A steel door leaf seen from the front, with a little window and a push bar. */
function leaf(p: Pix, x: number, w: number, handleRight: boolean) {
  p.rect(x, 4, w, 12, DOOR).hline(x, 4, w, DOOR_L).vline(x, 4, 12, DOOR_L).vline(x + w - 1, 5, 11, DOOR_D);
  p.rect(x + 3, 6, w - 6, 3, 0xa8d4ee).hline(x + 3, 6, w - 6, 0xdaf0ff).box(x + 2, 5, w - 4, 5, DOOR_D);
  p.hline(x + 2, 11, w - 4, 0xc6ced6).hline(x + 2, 12, w - 4, DOOR_D);
  p.set(handleRight ? x + w - 3 : x + 2, 10, 0xe8ecf0);
}

/** A door in a wall that runs across the screen (`tiles` = 1 or 2 wide). */
function doorAcross(tiles: 1 | 2, locked: boolean): Pix {
  const p = new Pix(16 * tiles, 16);
  doorFrame(p);
  if (locked) {
    if (tiles === 2) {
      leaf(p, 2, 14, true);
      leaf(p, 16, 14, false);
      p.vline(15, 4, 12, DOOR_D).vline(16, 4, 12, 0x3d4a5c);
      p.hline(6, 11, 20, 0xb9c1c9).hline(6, 12, 20, 0x6f7883); // chain
      padlock(p, 16, 9);
    } else {
      leaf(p, 2, 12, true);
      p.hline(4, 11, 9, 0xb9c1c9);
      padlock(p, 9, 9);
    }
  } else {
    // Swung open into the room: each leaf is a thin slab sticking out from the frame.
    const slab = (x: number) => p.rect(x, 4, 2, 12, DOOR).vline(x, 4, 12, DOOR_L).set(x, 15, DOOR_D).set(x + 1, 15, DOOR_D).box(x - 1, 4, 4, 12, OUT);
    slab(3);
    if (tiles === 2) slab(p.w - 5);
  }
  return p;
}

/** A door in a wall that runs up and down the screen (`tiles` = 1 or 2 tall), seen from above. */
function doorDown(tiles: 1 | 2, locked: boolean): Pix {
  const h = 16 * tiles;
  const p = new Pix(16, h);
  if (locked) {
    // The closed leaves: a slab across the doorway, seen from above.
    p.rect(6, 0, 4, h, DOOR).vline(6, 0, h, DOOR_L).vline(9, 0, h, DOOR_D);
    p.vline(5, 0, h, OUT).vline(10, 0, h, OUT);
    if (tiles === 2) p.hline(6, 15, 4, 0x3d4a5c).hline(6, 16, 4, DOOR_D);
    p.vline(11, 0, h, alpha(SHADOW, 0.25));
    padlock(p, 8, h / 2 - 4);
  } else {
    // Swung open against the walls above and below.
    const slab = (y: number) => p.rect(8, y, 7, 2, DOOR).hline(8, y, 7, DOOR_L).box(7, y - 1, 9, 4, OUT);
    slab(1);
    if (tiles === 2) slab(h - 3);
  }
  return p;
}

// ---------------------------------------------------------------- markers

/** One corner of the "you can scrap this" brackets (white, tinted with the value colour in game). */
function selectCorner(): Pix {
  return fromRows(['.....', '.WWW.', '.W...', '.W...', '.....'], { W: 0xffffff }).outline(OUT);
}

/** Soft spot of light on the floor under a fixture you can scrap (white, tinted in game). */
function glow(): Pix {
  return new Pix(16, 8).ellipse(0, 0, 16, 8, alpha(0xffffff, 0.3)).ellipse(2, 1, 12, 6, alpha(0xffffff, 0.25));
}

/** Recharge clock: frame i of 8 shows i eighths filled (green on dark). */
function rechargeFrame(i: number): Pix {
  const p = new Pix(9, 9);
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const dx = x - 4;
      const dy = y - 4;
      const d = Math.hypot(dx, dy);
      if (d > 4.3) continue;
      if (d > 3.3) {
        p.set(x, y, OUT);
        continue;
      }
      // Angle clockwise from 12 o'clock, 0..1.
      const a = ((Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1);
      p.set(x, y, a < i / 8 || (i === 8) ? 0x7ddc7d : 0x3a414b);
    }
  }
  return p;
}

// ---------------------------------------------------------------- the module

/** Every image this module makes, by texture key (pure data, so the tests can check them). */
export function objectPix(): Record<string, Pix> {
  const out: Record<string, Pix> = {
    drinking_fountain: fountain(false),
    drinking_fountain_side: fountain(true),
    wall_heater: radiator(false),
    wall_heater_side: radiator(true),
    toilet: toilet(false),
    toilet_side: toilet(true),
    mop_sink: mopSink(false),
    mop_sink_side: mopSink(true),
    electric_panel: electricPanel(false),
    electric_panel_side: electricPanel(true),
    desk: desk(),
    lamp: lamp(),
    abandoned_copper_pile: copperPile(),
    plant: plant(),
    trash_can: trashCan(),
    tree: tree(),
    van: vanSide(),
    van_tall: vanFront(),
    door_locked: doorAcross(2, true),
    door_open: doorAcross(2, false),
    door_locked_1: doorAcross(1, true),
    door_open_1: doorAcross(1, false),
    door_locked_v: doorDown(2, true),
    door_open_v: doorDown(2, false),
    door_locked_v1: doorDown(1, true),
    door_open_v1: doorDown(1, false),
    select_corner: selectCorner(),
    fixture_glow: glow(),
  };
  for (const c of CAR_COLORS) {
    out[c.key] = car(c.body);
    out[`${c.key}_rear`] = car(c.body, true);
  }
  return out;
}

/** Recharge clock frames, 'recharge-0' (empty) to 'recharge-8' (full), in the 'recharge' sheet. */
export const RECHARGE_FRAMES = 8;

export const objectArt: ArtModule = {
  keys: () => [...Object.keys(objectPix()), 'van_big', 'recharge'],
  paint: (textures: Phaser.Textures.TextureManager) => {
    const all = objectPix();
    for (const [key, pix] of Object.entries(all)) addTexture(textures, key, pix);
    // The menus show the van big: the same art at twice the size.
    addTexture(textures, 'van_big', all.van, PX * 2);
    addSheet(
      textures,
      'recharge',
      Array.from({ length: RECHARGE_FRAMES + 1 }, (_, i) => ({ name: `recharge-${i}`, pix: rechargeFrame(i) })),
    );
  },
};
