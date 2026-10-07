// Everyone who walks around: Dalton, Tomothy, Dunkin (and Dalton's student disguise), Mr. Gravy,
// the students and the sleepy coworker. Plus the 'shadow' under their feet and the scrap 'sack'.
// Pokemon Gen 3 overworld style: big head, small body, 1px dark outline, lit from the top-left.
//
// Every person is the same body templates dressed in a Look (skin, hair style, clothes, extras),
// so a new character is a few lines in LOOKS. Templates are ASCII art whose letters are colour
// *roles* (S skin, T shirt, H hair...; see paletteFor) that the look fills in. A frame is built in
// layers (backpack, body, clothes details, head, face, hair or hat, raised arm, held things), then
// stretched or squashed for the build (kid / adult / big), coloured and outlined.
//
// Textures per look (the contract is in src/entities/CharacterView.ts):
//   `${key}`        front standing image (= frame down-0)
//   `${key}_sheet`  frames `${facing}-0|1|2` (stand, step, step), `${facing}-yell`,
//                   `${facing}-work-0|1` (hammering), and `sleep-0|1` for looks that sleep
//   `${key}_big`    48x48 portrait (trainer-card bust) for menus and dialog boxes

import type Phaser from 'phaser';
import type { ArtModule } from './index';
import { Pix, addSheet, addTexture, alpha, fromRows, mix, shade, type Color } from './pixel';

// ---------------------------------------------------------------- looks (edit these)

export type HairStyle = 'short' | 'cap' | 'horseshoe' | 'beanie' | 'hood' | 'ponytail' | 'combover' | 'messy';
export type TopStyle = 'tee' | 'hoodie' | 'suit' | 'cardigan';
/** kid: shorter body (bigger head for their size); big: wider and taller (Mr. Gravy). */
export type Build = 'kid' | 'adult' | 'big';
export type EyeStyle = 'normal' | 'stern' | 'droopy';

export interface Look {
  build?: Build;
  skin: number;
  hair: HairStyle;
  hairColor: number;
  /** Cap or beanie colour. */
  hat?: number;
  top: TopStyle;
  shirt: number;
  /** Small details: cap logo, tie, hair tie, the shirt under a cardigan. */
  accent?: number;
  pants: number;
  shoes: number;
  /** Backpack colour; no backpack without it. */
  pack?: number;
  eyes?: EyeStyle;
  mustache?: boolean;
  /** Holds a coffee mug. */
  mug?: boolean;
  /** Gets sleep-0 / sleep-1 frames (slumped, dozing). */
  sleeps?: boolean;
}

const SKIN = { light: 0xf2c38f, pale: 0xf6cfa6, peach: 0xefc19a, tan: 0xd9a273, warm: 0xe0ac69, brown: 0x8d5a3b };
const JEANS = 0x3f5f8f;

/** Texture key -> look. Player looks use CHARACTERS[id].sprite; '<sprite>_disguise' is Dalton's ability. */
export const LOOKS: Record<string, Look> = {
  dalton: {
    skin: SKIN.light, hair: 'cap', hairColor: 0x6b4a2e, hat: 0x2f3b46, accent: 0xe8914a,
    top: 'tee', shirt: 0x4caf50, pants: JEANS, shoes: 0x7a5230,
  },
  // Act Like a Student: hood up, backpack on.
  dalton_disguise: {
    skin: SKIN.light, hair: 'hood', hairColor: 0x6b4a2e, accent: 0xf4f0e6,
    top: 'hoodie', shirt: 0x7e57c2, pants: JEANS, shoes: 0xe8e4dc, pack: 0xf9a825,
  },
  tomothy: {
    skin: SKIN.peach, hair: 'horseshoe', hairColor: 0xc9cdd2,
    top: 'tee', shirt: 0x42a5f5, pants: 0x6b6150, shoes: 0x5a4030,
  },
  dunkin: {
    skin: SKIN.tan, hair: 'beanie', hairColor: 0x3a2a20, hat: 0x37474f,
    top: 'tee', shirt: 0xef5350, pants: 0x2f4a6b, shoes: 0x3a3a40,
  },
  mr_gravy: {
    build: 'big', skin: 0xf0b98a, hair: 'combover', hairColor: 0x4a3426, eyes: 'stern', mustache: true,
    top: 'suit', shirt: 0x7b5534, accent: 0xc62828, pants: 0x4e3624, shoes: 0x2e2420,
  },
  student: {
    build: 'kid', skin: SKIN.warm, hair: 'hood', hairColor: 0x3a2618, accent: 0xf4f0e6,
    top: 'hoodie', shirt: 0x26a69a, pants: 0x455a8a, shoes: 0xe85a4f, pack: 0xef6c00,
  },
  student_b: {
    build: 'kid', skin: SKIN.pale, hair: 'ponytail', hairColor: 0x9a5a2a, accent: 0xffd23d,
    top: 'hoodie', shirt: 0xec407a, pants: 0x4a4a62, shoes: 0xf0ece4, pack: 0x3949ab,
  },
  student_c: {
    build: 'kid', skin: SKIN.brown, hair: 'short', hairColor: 0x2a2220, accent: 0xf4f0e6,
    top: 'hoodie', shirt: 0xfbc02d, pants: 0x3b4f7a, shoes: 0x2e7d32, pack: 0x2e7d32,
  },
  sleepy_coworker: {
    skin: 0xebc7a0, hair: 'messy', hairColor: 0x8a6a48, eyes: 'droopy', mug: true, sleeps: true,
    top: 'cardigan', shirt: 0xb39a72, accent: 0xe8e2d0, pants: 0x6d5a45, shoes: 0x4a3f38,
  },
};

// ---------------------------------------------------------------- colours

const INK = 0x283040;

/** Colour roles used by the templates. */
function paletteFor(look: Look): Record<string, Color> {
  const hat = look.hat ?? look.hairColor;
  const accent = look.accent ?? 0xf4f0e6;
  const pack = look.pack ?? 0x888888;
  return {
    K: INK, // inner lines
    E: 0x1e2430, // eyes
    M: 0x8a2b3a, // open mouth
    m: mix(INK, look.skin, 0.35), // mouth line (portraits)
    W: 0xf4f2ea, // whites: collars, pompom, eye glints
    w: 0xc9c6bc,
    S: look.skin,
    R: look.skin, // a hand (held things are drawn there)
    s: shade(look.skin, 0.16),
    L: shade(look.skin, -0.35),
    k: mix(shade(look.skin, 0.28), 0x7a5a8a, 0.35), // tired eye bags
    H: look.hairColor,
    h: shade(look.hairColor, 0.3),
    I: shade(look.hairColor, -0.3),
    T: look.shirt,
    t: shade(look.shirt, 0.24),
    U: shade(look.shirt, -0.22),
    P: look.pants,
    p: shade(look.pants, 0.28),
    F: look.shoes,
    f: shade(look.shoes, 0.3),
    C: hat,
    c: shade(hat, 0.22),
    V: shade(hat, 0.42),
    A: accent,
    a: shade(accent, 0.25),
    B: pack,
    b: shade(pack, 0.28),
    G: 0xb9c2ca, // wrench
    g: 0x6f7a85,
    O: 0x5a3a22, // coffee
    x: alpha(0xffffff, 0.45), // steam
  };
}

// ---------------------------------------------------------------- role grids

const W = 16;
const H = 24;

/** A picture made of role letters ('.' = empty). */
class Grid {
  cells: string[];

  constructor(
    public w: number,
    public h: number,
  ) {
    this.cells = new Array(w * h).fill('.');
  }

  get(x: number, y: number): string {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.cells[y * this.w + x];
  }

  set(x: number, y: number, role: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = role;
    return this;
  }

  /** Draws template rows at dx,dy: '.' and ' ' are skipped, '_' erases. */
  stamp(rows: readonly string[], dx = 0, dy = 0, flip = false): this {
    rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const x = flip ? this.w - 1 - (dx + i) : dx + i;
        this.set(x, dy + y, ch === '_' ? '.' : ch);
      }
    });
    return this;
  }

  /** Every cell holding `role`. */
  find(role: string): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    this.cells.forEach((c, i) => c === role && out.push({ x: i % this.w, y: Math.floor(i / this.w) }));
    return out;
  }

  /** A copy with some columns and rows doubled and some rows removed (indexes in this grid). */
  reshape(dupCols: number[], dupRows: number[], dropRows: number[] = []): Grid {
    const xs: number[] = [];
    for (let x = 0; x < this.w; x++) {
      xs.push(x);
      if (dupCols.includes(x)) xs.push(x);
    }
    const ys: number[] = [];
    for (let y = 0; y < this.h; y++) {
      if (dropRows.includes(y)) continue;
      ys.push(y);
      if (dupRows.includes(y)) ys.push(y);
    }
    const g = new Grid(xs.length, ys.length);
    ys.forEach((sy, y) => xs.forEach((sx, x) => g.set(x, y, this.get(sx, sy))));
    return g;
  }

  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) out.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }

  /** Coloured and outlined. */
  toPix(palette: Record<string, Color>): Pix {
    return fromRows(this.rows(), palette).outline(INK);
  }

  // Shapes, for the portraits.
  /** Filled ellipse in the box x,y,w,h; `only` limits it to cells holding those roles; rows outside minY..maxY are skipped. */
  ellipse(x: number, y: number, w: number, h: number, role: string, only?: string, maxY = Infinity, minY = -Infinity): this {
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let yy = Math.max(y, minY); yy < Math.min(y + h, maxY + 1); yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = (xx + 0.5 - cx) / (w / 2);
        const dy = (yy + 0.5 - cy) / (h / 2);
        if (dx * dx + dy * dy <= 1 && (!only || only.includes(this.get(xx, yy)))) this.set(xx, yy, role);
      }
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number, role: string, only?: string): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) if (!only || only.includes(this.get(xx, yy))) this.set(xx, yy, role);
    }
    return this;
  }

  /** Replaces one role with another inside a box (shading). */
  recolor(from: string, to: string, x = 0, y = 0, w = this.w, h = this.h): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.get(xx, yy) === from) this.set(xx, yy, to);
    return this;
  }
}

/** Template rows starting at row y of the frame. */
interface Tpl {
  y: number;
  rows: readonly string[];
}
const tpl = (y: number, ...rows: string[]): Tpl => ({ y, rows });

type View = 'down' | 'up' | 'right';

// ---------------------------------------------------------------- heads (skin) and faces

const HEAD: Record<View, Tpl> = {
  down: tpl(1,
    '.....SSSSSS.....',
    '...SSSSSSSSSS...',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSs..',
    '.sSSSSSSSSSSSss.',
    '.sSSSSSSSSSSSss.',
    '..sSSSSSSSSSSs..',
    '...ssSSSSSSss...',
  ),
  up: tpl(1,
    '.....SSSSSS.....',
    '...SSSSSSSSSS...',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSs..',
    '.sSSSSSSSSSSSss.',
    '.sSSSSSSSSSSSss.',
    '..sSSSSSSSSSSs..',
    '...ssssssssss...',
  ),
  right: tpl(1,
    '....SSSSSS......',
    '...SSSSSSSSS....',
    '..SSSSSSSSSSS...',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSSSSSSSSS..',
    '..SSSSssSSSSSSS.',
    '..sSSSsSSSSSSss.',
    '..ssSSSSSSSSSs..',
    '...ssSSSSSSss...',
  ),
};

/** Eye pixels per style and view, as [x, y, role] (y relative to the head's top row = 1). */
const EYES: Record<EyeStyle | 'closed', Record<'down' | 'right', [number, number, string][]>> = {
  normal: {
    down: [[5, 7, 'E'], [5, 8, 'E'], [10, 7, 'E'], [10, 8, 'E']],
    right: [[11, 7, 'E'], [11, 8, 'E']],
  },
  stern: {
    down: [[4, 5, 'h'], [5, 5, 'h'], [6, 5, 'h'], [9, 5, 'h'], [10, 5, 'h'], [11, 5, 'h'], [5, 7, 'E'], [5, 8, 'E'], [10, 7, 'E'], [10, 8, 'E']],
    right: [[10, 5, 'h'], [11, 5, 'h'], [12, 5, 'h'], [11, 7, 'E'], [11, 8, 'E']],
  },
  droopy: {
    down: [[4, 7, 's'], [5, 7, 's'], [10, 7, 's'], [11, 7, 's'], [5, 8, 'E'], [10, 8, 'E'], [4, 8, 'E'], [11, 8, 'E'], [5, 9, 'k'], [10, 9, 'k']],
    right: [[11, 7, 's'], [12, 7, 's'], [11, 8, 'E'], [12, 8, 'E'], [11, 9, 'k']],
  },
  closed: {
    down: [[4, 8, 'E'], [5, 8, 'E'], [10, 8, 'E'], [11, 8, 'E']],
    right: [[11, 8, 'E'], [12, 8, 'E']],
  },
};

const MOUTH_OPEN: Record<'down' | 'right', [number, number, string][]> = {
  down: [[7, 9, 'K'], [8, 9, 'K'], [7, 10, 'M'], [8, 10, 'M']],
  right: [[12, 9, 'K'], [13, 9, 'M'], [12, 10, 'M']],
};

const MUSTACHE: Record<'down' | 'right', Tpl> = {
  down: tpl(9, '.....HHhhHH.....', '......h..h......'),
  right: tpl(9, '..........HHHh..'),
};

// ---------------------------------------------------------------- hair and hats

const HAIR: Record<HairStyle, Record<View, Tpl>> = {
  short: {
    down: tpl(1,
      '.....HHHHHH.....',
      '...HHIIHHHHHH...',
      '..HHIIHHHHHHHH..',
      '..HIHHHHHHHHHh..',
      '..HHHHHHHHHHhh..',
      '..HHHHHh.Hh.Hh..',
      '..Hh........h...',
    ),
    up: tpl(1,
      '.....HHHHHH.....',
      '...HHIIHHHHHH...',
      '..HHIIHHHHHHHH..',
      '..HIHHHHHHHHHh..',
      '..HHHHHHHHHHHh..',
      '..HHHHHHHHHHHh..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhhhhhhh....',
    ),
    right: tpl(1,
      '....HHHHHH......',
      '...HHIIHHHHH....',
      '..HHIIHHHHHHH...',
      '..HIHHHHHHHHHH..',
      '..HHHHHHHHHHhH..',
      '..HHHHHh...h.h..',
      '..HHHHh.........',
      '..hHHh..........',
      '..hhh...........',
      '...h............',
    ),
  },
  cap: {
    down: tpl(1,
      '.....CCCCCC.....',
      '...CCCCCCCCCC...',
      '..CCCCCAACCCCc..',
      '..CCCCCAACCCcc..',
      '.VVVVVVVVVVVVVV.',
      '..HssssssssssH..',
      '..H..........h..',
    ),
    up: tpl(1,
      '.....CCCCCC.....',
      '...CCCCCCCCCC...',
      '..CCCCCCCCCCCc..',
      '..CCCCCCCCCCCc..',
      '..cccccHHcccccc.',
      '..HHHHHHHHHHHh..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhhhhhhh....',
    ),
    right: tpl(1,
      '....CCCCCC......',
      '...CCCCCCCCC....',
      '..CCCCCCCCAAC...',
      '..CCCCCCCCAACc..',
      '..cCCCCCCCCVVVV.',
      '..HHHHHssssss...',
      '..HHHHh.........',
      '..hHHh..........',
      '..hhh...........',
      '...h............',
    ),
  },
  horseshoe: {
    down: tpl(1,
      '................',
      '....LL..........',
      '...LL...........',
      '................',
      '..HH........Hh..',
      '..HHH......hHh..',
      '..HH........hh..',
      '..H..........h..',
    ),
    up: tpl(1,
      '................',
      '....LL..........',
      '...LL...........',
      '................',
      '..HHH.HH.HH.Hh..',
      '..HHHHHHHHHHHh..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhhhhhhh....',
    ),
    right: tpl(1,
      '................',
      '....LL..........',
      '...LL...........',
      '................',
      '..HHHH..........',
      '..HHHHH.........',
      '..HHHH..........',
      '..hHHh..........',
      '..hhh...........',
      '...h............',
    ),
  },
  beanie: {
    down: tpl(1,
      '......WWW.......',
      '...CCCWWWCCC....',
      '..CcCCcCCcCCcC..',
      '..CcCCcCCcCCcc..',
      '..VVVVVVVVVVVV..',
      '..VVVVVVVVVVVV..',
      '..H..........h..',
    ),
    up: tpl(1,
      '......WWW.......',
      '...CCCWWWCCC....',
      '..CcCCcCCcCCcC..',
      '..CcCCcCCcCCcc..',
      '..VVVVVVVVVVVV..',
      '..VVVVVVVVVVVV..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhhhhhhh....',
    ),
    right: tpl(1,
      '.....WWW........',
      '...CCWWWCCC.....',
      '..CcCCcCCcCCC...',
      '..CcCCcCCcCCcc..',
      '..VVVVVVVVVVVV..',
      '..VVVVVVVVVVVV..',
      '..HHHH..........',
      '..hHHh..........',
      '..hhh...........',
      '...h............',
    ),
  },
  // Hood up (the hoodie's colour), a bit of fringe showing.
  hood: {
    down: tpl(1,
      '....TTTTTTTT....',
      '...TUUTTTTTTT...',
      '..TUTTTTTTTTTt..',
      '.TUTTHHHHHHTTtt.',
      '.TTTHHHhHHhHttt.',
      '.TTtH.h...h.Htt.',
      '.TTt........ttt.',
      '.TTt........ttt.',
      '.tTt........tt..',
      '..tt........t...',
    ),
    up: tpl(1,
      '....TTTTTTTT....',
      '...TUUTTTTTTT...',
      '..TUTTTTTTTTTt..',
      '.TUTTTTTTTTTTtt.',
      '.TTTTTTTTTTTTtt.',
      '.TTTTTTTTTTTTtt.',
      '.TTTTTTTTTTTttt.',
      '.tTTTTTTTTTTtt..',
      '..tTTTTTTTTtt...',
      '...ttTTTTTtt....',
      '.....tttttt.....',
    ),
    right: tpl(1,
      '...TTTTTTT......',
      '..TUUTTTTTTT....',
      '.TUTTTTTTTTTT...',
      '.TTTTTTTTHHHHt..',
      '.TTTTTTTHHHhHt..',
      '.TTTTTTtHh..h...',
      '.TTTTTTt........',
      '.tTTTTTt........',
      '.ttTTTt.........',
      '..tttt..........',
    ),
  },
  ponytail: {
    down: tpl(1,
      '.....HHHHHH.....',
      '...HHIIHHHHHH...',
      '..HHIIHHHHHHHH..',
      '..HIHHHHHHHHHh..',
      '..HHHHHHhHHHhh..',
      '.HHHHhh..hhHHhh.',
      '.HHh........hh..',
      '.Hh..........h..',
      '.h...........h..',
    ),
    up: tpl(1,
      '.....HHHHHH.....',
      '...HHIIHHHHHH...',
      '..HHIIHHHHHHHH..',
      '..HIHHHHHHHHHh..',
      '..HHHHHHHHHHHh..',
      '..HHHHHAAHHHHh..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhHHHHhh....',
      '......HHHh......',
      '......hHHh......',
      '.......hh.......',
    ),
    right: tpl(1,
      '....HHHHHH......',
      '...HHIIHHHHH....',
      '..HHIIHHHHHHH...',
      '..HIHHHHHHHHHH..',
      '.AHHHHHHHHHhhH..',
      '.HHHHHHh...h.h..',
      '.HhHHHh.........',
      '.HhhHh..........',
      '.h.hh...........',
      '...h............',
    ),
  },
  // Balding, a few strands combed over the top.
  combover: {
    down: tpl(1,
      '................',
      '....HHHHHHH.....',
      '...L.......Hh...',
      '..HHHHHHHHHHh...',
      '..HH........Hh..',
      '..HH........hh..',
      '..H..........h..',
    ),
    up: tpl(1,
      '................',
      '....HHHHHHH.....',
      '...L.......Hh...',
      '..HHHHHHHHHHh...',
      '..HHHHHHHHHHHh..',
      '..HHHHHHHHHHhh..',
      '..HHHHHHHHHHhh..',
      '..hHHHHHHHHHhh..',
      '..hhHHHHHHHhhh..',
      '....hhhhhhhh....',
    ),
    right: tpl(1,
      '................',
      '....HHHHHHH.....',
      '...L........H...',
      '..HHHHHHHHHH....',
      '..HHHH..........',
      '..HHHHH.........',
      '..HHHH..........',
      '..hHHh..........',
      '..hhh...........',
      '...h............',
    ),
  },
  // Bed head.
  messy: {
    down: tpl(1,
      '...H.HHHH.HH.H..',
      '..HHHHIIHHHHHh..',
      '.HHHIIHHHHHHHHh.',
      '..HIHHHHHHHHHh..',
      '.HHHHhHHHhHHhhh.',
      '.HHHHh.Hh..hHhh.',
      '..Hh.h.......h..',
    ),
    up: tpl(1,
      '...H.HHHH.HH.H..',
      '..HHHHIIHHHHHh..',
      '.HHHIIHHHHHHHHh.',
      '..HIHHHHHHHHHh..',
      '.HHHHHHhHHHHHhh.',
      '..HHHHHHHHhHHh..',
      '.HHHHHHHHHHHhhh.',
      '..hHHhHHHHHhhh..',
      '..hhHHHhHHHhhh..',
      '...hh.hhhh.hh...',
    ),
    right: tpl(1,
      '...H.HHH.HH.....',
      '..HHHHIIHHHHh...',
      '.HHHIIHHHHHHHh..',
      '..HIHHHHHHHHHHh.',
      '.HHHHHHHHHhHhh..',
      '..HHHHHh.h..h...',
      '.HHHHh..........',
      '..hHHh..........',
      '.hhh............',
      '...h............',
    ),
  },
};

// ---------------------------------------------------------------- bodies

// Rows 11-22. Stand frames have the shoulders at row 12; step frames bob down a row (the head
// too), so step legs are a row shorter. R marks the hand that holds things (mug, wrench).
const BODY = {
  downStand: tpl(11,
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTtt..',
    '..TtTTTTTTTTtt..',
    '..TtTTTTTTTttt..',
    '..SKPPPPPPPPKR..',
    '....PPPPPPPp....',
    '....PPPPPPpp....',
    '....PPp..PPp....',
    '....FFF..FFf....',
    '....FFF..FFf....',
  ),
  downStep: tpl(11,
    '................',
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTtt..',
    '..UtTTTTTTTTtt..',
    '..SKTTTTTTTttt..',
    '....PPPPPPPPKR..',
    '....PPPPPPpp....',
    '....PPp..fff....',
    '....FFF..fff....',
    '....FFF.........',
  ),
  // Right arm up (the arm itself is ARM_UP, drawn over the head).
  downRaise: tpl(11,
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTt...',
    '..TtTTTTTTTTt...',
    '..TtTTTTTTTtt...',
    '..SKPPPPPPPPK...',
    '....PPPPPPPp....',
    '....PPPPPPpp....',
    '....PPp..PPp....',
    '....FFF..FFf....',
    '....FFF..FFf....',
  ),
  upStand: tpl(11,
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTtt..',
    '..TtTTTTTTTTtt..',
    '..TtTTTTTTTttt..',
    '..RKPPPPPPPPKS..',
    '....PPPPPPPp....',
    '....PPPPPPpp....',
    '....PPp..PPp....',
    '....FFF..FFf....',
    '....fff..fff....',
  ),
  upStep: tpl(11,
    '................',
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTtt..',
    '..UtTTTTTTTTtt..',
    '..RKTTTTTTTttt..',
    '....PPPPPPPPKS..',
    '....PPPPPPpp....',
    '....PPp..FFF....',
    '....FFF..FFF....',
    '....fff.........',
  ),
  upRaise: tpl(11,
    '....KKKKKKKK....',
    '...TTTTTTTTTT...',
    '..UTTTTTTTTTTt..',
    '..UtTTTTTTTTt...',
    '..TtTTTTTTTTt...',
    '..TtTTTTTTTtt...',
    '..SKPPPPPPPPK...',
    '....PPPPPPPp....',
    '....PPPPPPpp....',
    '....PPp..PPp....',
    '....FFF..FFf....',
    '....fff..fff....',
  ),
  rightStand: tpl(11,
    '.....KKKKKK.....',
    '.....TTTTTTT....',
    '....UTTTTTTT....',
    '....UTtTTtTt....',
    '....TTtTTtTt....',
    '....TTtTTtTt....',
    '....PPKRRKPp....',
    '....PPPPPPPp....',
    '.....PPPPPp.....',
    '.....PPPPpp.....',
    '.....FFFFFFf....',
    '.....FFFFFFFf...',
  ),
  // Near leg forward, arm back.
  rightStepA: tpl(11,
    '................',
    '.....KKKKKK.....',
    '.....TTTTTTT....',
    '....UTTTTTTT....',
    '...tUTTTTTtt....',
    '...tUTTTTTtt....',
    '..RKTTTTTTtt....',
    '....PPPPPPPp....',
    '....pPPPPPPPp...',
    '...pp....PPPp...',
    '..fff....FFFFf..',
    '..........FFFf..',
  ),
  // Far leg forward, arm forward.
  rightStepB: tpl(11,
    '................',
    '.....KKKKKK.....',
    '.....TTTTTTT....',
    '....UTTTTTTT....',
    '....UTTtTTTtt...',
    '....UTTtTTTtt...',
    '....TTTtTTKRR...',
    '....PPPPPPPp....',
    '....PPPPPPpppp..',
    '...PPP...pppp...',
    '..FFF....ffff...',
    '..........fff...',
  ),
  // Arm straight out, pointing.
  rightPoint: tpl(11,
    '.....KKKKKK.....',
    '.....TTTTTTTTRR.',
    '....UTTTTTTTtRR.',
    '....UTTTTTTt....',
    '....TTTTTTtt....',
    '....TTTTTttt....',
    '....PPPPPPPp....',
    '....PPPPPPPp....',
    '.....PPPPPp.....',
    '.....PPPPpp.....',
    '.....FFFFFFf....',
    '.....FFFFFFFf...',
  ),
  // Arm out and down, hammering.
  rightStrike: tpl(11,
    '.....KKKKKK.....',
    '.....TTTTTTT....',
    '....UTTTTTTTT...',
    '....UTTTTTTtTT..',
    '....TTTTTTttRR..',
    '....TTTTTttt....',
    '....PPPPPPPp....',
    '....PPPPPPPp....',
    '.....PPPPPp.....',
    '.....PPPPpp.....',
    '.....FFFFFFf....',
    '.....FFFFFFFf...',
  ),
  // Sitting on the floor, slumped (the head droops down over the chest).
  sleep: tpl(11,
    '................',
    '................',
    '................',
    '................',
    '..UTTTTTTTTTTt..',
    '.UUTTTTTTTTTTtt.',
    '.UtTTTTTTTTTTtt.',
    '.TtTTTTTTTTTttt.',
    '.SKPPPPPPPPPPKR.',
    '..PPPPpPPPPpPP..',
    '..FFFP....PpFF..',
    '..FFF......FFF..',
  ),
};

// The raised arm, drawn over the head; its inner edge is outlined so it stands out from a hood.
/** Yelling: hand high. */
const ARM_UP = tpl(2,
  '.............RR.',
  '............KRR.',
  '............KTT.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............TTt.',
  '............Tt..',
);

/** Hammering: hand lower, leaving room for the wrench above the fist. */
const ARM_TOOL = tpl(5,
  '.............RR.',
  '............KRR.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............KTt.',
  '............TTt.',
  '............Tt..',
);

const WRENCH = {
  /** Jaw up, above the fist. */
  up: ['G.G', 'GGg', '.G.', '.g.'],
  /** Jaw forward, to the right of the fist. */
  forward: ['.GG', 'Gg.', '.gg'],
  /** Hanging down from the fist. */
  down: ['.G.', '.g.', 'GgG', 'g.g'],
};

const MUG = ['WWw.', 'WWwK', 'wwK.'];

// Clothes details, at the stand-frame rows (step frames bob them down a row).
const TOP_DETAILS: Record<TopStyle, Partial<Record<View, Tpl>>> = {
  tee: {
    down: tpl(12, '......ssss......'),
  },
  hoodie: {
    down: tpl(12, '......A..A......', '......A..A......', '................', '.....tttttt.....', '.....t....t.....'),
    right: tpl(12, '...........A....', '...........A....'),
  },
  suit: {
    down: tpl(12, '.....WWAAWW.....', '.....tWAAWt.....', '......tAAt......', '.......aa.......'),
    up: tpl(12, '.....WWWWWW.....'),
    right: tpl(12, '..........WA....', '...........A....', '...........a....'),
  },
  cardigan: {
    down: tpl(12, '.....UAAAAU.....', '.....WAAAAU.....', '.....UAAAAU.....', '.....WAAAAU.....', '.....UAAAAU.....'),
    right: tpl(12, '...........A....', '...........A....', '...........A....', '...........A....'),
  },
};

/** A hood worn down lies on the back. */
const HOOD_DOWN: Partial<Record<View, Tpl>> = {
  up: tpl(12, '....tTTTTTTt....', '.....tTTTTt.....', '......tttt......'),
  right: tpl(11, '...tTT..........', '...tTT..........', '....t...........'),
};

const PACK: Record<View, Tpl> = {
  // Straps over the shoulders.
  down: tpl(12, '...bb......bb...', '....b......b....', '....b......b....'),
  up: tpl(13, '....bBBBBBBb....', '....BBBBBBBB....', '....BbbbbbbB....', '....BbBBBBbB....', '....BBBBBBBB....', '....bbbbbbbb....'),
  // On the back, behind the body.
  right: tpl(12, '..BBB...........', '.BBBB...........', '.BbBB...........', '.BbBB...........', '.BBBB...........', '..bbb...........'),
};

/** Template rows that aren't exactly 16 wide (a typo shifts the art). Checked by the unit tests. */
export function templateProblems(): string[] {
  const problems: string[] = [];
  const check = (name: string, t: Tpl) =>
    t.rows.forEach((r, i) => r.length !== W && problems.push(`${name} row ${i}: ${r.length} wide`));
  for (const [v, t] of Object.entries(HEAD)) check(`HEAD.${v}`, t);
  for (const [style, views] of Object.entries(HAIR)) for (const [v, t] of Object.entries(views)) check(`HAIR.${style}.${v}`, t);
  for (const [name, t] of Object.entries(BODY)) check(`BODY.${name}`, t);
  for (const [style, views] of Object.entries(TOP_DETAILS)) for (const [v, t] of Object.entries(views)) check(`TOP_DETAILS.${style}.${v}`, t!);
  for (const [v, t] of Object.entries({ ...HOOD_DOWN })) check(`HOOD_DOWN.${v}`, t!);
  for (const [v, t] of Object.entries(PACK)) check(`PACK.${v}`, t);
  for (const [v, t] of Object.entries(MUSTACHE)) check(`MUSTACHE.${v}`, t);
  check('ARM_UP', ARM_UP);
  check('ARM_TOOL', ARM_TOOL);
  for (const [name, t] of Object.entries(BODY)) if (t.y + t.rows.length !== H - 1) problems.push(`BODY.${name} ends at row ${t.y + t.rows.length - 1}, not ${H - 2}`);
  return problems;
}

// ---------------------------------------------------------------- frames

interface FrameSpec {
  name: string;
  view: View;
  body: Tpl;
  /** Head and upper body one row lower (walking bounce). */
  bob: 0 | 1;
  /** Mirror the body (the other step). */
  flipBody?: boolean;
  yell?: boolean;
  /** Raised arm over the head: 'yell' (high) or 'tool' (lower, wrench above). */
  armUp?: 'yell' | 'tool';
  wrench?: keyof typeof WRENCH;
  closedEyes?: boolean;
  /** Head moved down this many rows (sleeping). */
  headDrop?: number;
}

const WALK_FRAMES: FrameSpec[] = [
  { name: 'down-0', view: 'down', body: BODY.downStand, bob: 0 },
  { name: 'down-1', view: 'down', body: BODY.downStep, bob: 1 },
  { name: 'down-2', view: 'down', body: BODY.downStep, bob: 1, flipBody: true },
  { name: 'up-0', view: 'up', body: BODY.upStand, bob: 0 },
  { name: 'up-1', view: 'up', body: BODY.upStep, bob: 1 },
  { name: 'up-2', view: 'up', body: BODY.upStep, bob: 1, flipBody: true },
  { name: 'right-0', view: 'right', body: BODY.rightStand, bob: 0 },
  { name: 'right-1', view: 'right', body: BODY.rightStepA, bob: 1 },
  { name: 'right-2', view: 'right', body: BODY.rightStepB, bob: 1 },
  { name: 'down-yell', view: 'down', body: BODY.downRaise, bob: 0, yell: true, armUp: 'yell' },
  { name: 'up-yell', view: 'up', body: BODY.upRaise, bob: 0, armUp: 'yell' },
  { name: 'right-yell', view: 'right', body: BODY.rightPoint, bob: 0, yell: true },
  { name: 'down-work-0', view: 'down', body: BODY.downRaise, bob: 0, armUp: 'tool', wrench: 'up' },
  { name: 'down-work-1', view: 'down', body: BODY.downStand, bob: 0, wrench: 'down' },
  { name: 'up-work-0', view: 'up', body: BODY.upRaise, bob: 0, armUp: 'tool', wrench: 'up' },
  { name: 'up-work-1', view: 'up', body: BODY.upStand, bob: 0, wrench: 'down' },
  { name: 'right-work-0', view: 'right', body: BODY.rightPoint, bob: 0, wrench: 'up' },
  { name: 'right-work-1', view: 'right', body: BODY.rightStrike, bob: 0, wrench: 'forward' },
];

const SLEEP_FRAMES: FrameSpec[] = [
  // Breathing: the head sinks a row (bob), so marks over it stay put.
  { name: 'sleep-0', view: 'down', body: BODY.sleep, bob: 0, closedEyes: true, headDrop: 6 },
  { name: 'sleep-1', view: 'down', body: BODY.sleep, bob: 1, closedEyes: true, headDrop: 6 },
];

const stampTpl = (g: Grid, t: Tpl | undefined, dy = 0, flip = false) => t && g.stamp(t.rows, 0, t.y + dy, flip);
const stampPixels = (g: Grid, px: [number, number, string][], dy: number) => px.forEach(([x, y, r]) => g.set(x, y + dy, r));

/** Draws a small held thing next to the topmost hand pixel: above it, below it or in front (right). */
function holdAt(g: Grid, rows: readonly string[], where: 'above' | 'below' | 'right') {
  const hands = g.find('R');
  if (!hands.length) return;
  const top = Math.min(...hands.map((p) => p.y));
  const xs = hands.filter((p) => p.y === top).map((p) => p.x);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const w = rows[0].length;
  const cx = Math.floor((left + right) / 2) - Math.floor(w / 2) + (w % 2 === 0 ? 1 : 0);
  // Stay inside the frame, leaving room for the outline.
  const x = Math.max(1, Math.min(g.w - 1 - w, where === 'right' ? right + 1 : cx));
  if (where === 'right') g.stamp(rows, x, top - Math.floor(rows.length / 2));
  else if (where === 'below') g.stamp(rows, x, top + 1);
  else g.stamp(rows, x, top - rows.length);
}

/** One frame as role letters, before the build reshapes it. */
export function composeFrame(look: Look, f: FrameSpec): Grid {
  const g = new Grid(W, H);
  const view = f.view;
  const head = f.bob + (f.headDrop ?? 0);
  const faceView = view === 'up' ? null : view;

  // Behind the body.
  if (look.pack && view === 'right') stampTpl(g, PACK.right, f.bob);
  if (look.top === 'hoodie' && look.hair !== 'hood' && view === 'right') stampTpl(g, HOOD_DOWN.right, f.bob);

  g.stamp(f.body.rows, 0, f.body.y, f.flipBody);
  if (!f.headDrop) {
    stampTpl(g, TOP_DETAILS[look.top][view], f.bob);
    if (look.top === 'hoodie' && look.hair !== 'hood' && view === 'up') stampTpl(g, HOOD_DOWN.up, f.bob);
    if (look.pack && view !== 'right') stampTpl(g, PACK[view], f.bob);
  } else if (look.top === 'cardigan') {
    stampTpl(g, TOP_DETAILS.cardigan.down, 4);
  }

  // Head, face, hair.
  stampTpl(g, HEAD[view], head);
  if (faceView) {
    const eyes = f.closedEyes ? 'closed' : (look.eyes ?? 'normal');
    stampPixels(g, EYES[eyes][faceView], head);
    if (look.mustache) stampTpl(g, MUSTACHE[faceView], head);
    if (f.yell) stampPixels(g, MOUTH_OPEN[faceView].filter(([, y]) => !look.mustache || y > 9), head);
  }
  stampTpl(g, HAIR[look.hair][view], head);

  // In front of everything.
  if (f.armUp) {
    const arm = f.armUp === 'yell' ? ARM_UP : ARM_TOOL;
    // Only the raised hand holds things now.
    g.recolor('R', 'S');
    g.stamp(arm.rows, 0, arm.y, view === 'up');
  }
  if (f.wrench) holdAt(g, WRENCH[f.wrench], f.wrench === 'up' ? 'above' : f.wrench === 'down' ? 'below' : 'right');
  else if (look.mug && !f.yell && view !== 'up') {
    if (f.headDrop) g.stamp(MUG, 11, 20);
    else holdAt(g, MUG, view === 'right' ? 'right' : 'above');
  }
  return g;
}

/** Stretches or squashes a composed frame for the look's build. */
function reshape(g: Grid, build: Build, f: FrameSpec): Grid {
  if (f.headDrop) return build === 'big' ? g.reshape([7, 8], []) : g;
  if (build === 'kid') return g.reshape([], [], [15 + f.bob, 19]);
  if (build === 'big') return g.reshape(f.view === 'right' ? [5, 9] : [7, 8], [10 + f.bob, 14 + f.bob]);
  return g;
}

/** Topmost row with anything drawn (-1 when empty). */
export function topRow(p: Pix): number {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.get(x, y) !== 0) return y;
  return -1;
}

export interface CharacterFrame {
  name: string;
  pix: Pix;
  /** Row where the head starts when not bobbing (walking steps and breathing don't move it). */
  headRow: number;
}

/** Every frame of a look's sheet, named for CharacterView (left = right mirrored). */
export function characterFrames(look: Look): CharacterFrame[] {
  const pal = paletteFor(look);
  const build = look.build ?? 'adult';
  const specs = [...WALK_FRAMES, ...(look.sleeps ? SLEEP_FRAMES : [])];
  const out: CharacterFrame[] = [];
  for (const f of specs) {
    const pix = reshape(composeFrame(look, f), build, f).toPix(pal);
    const headRow = topRow(pix) - f.bob;
    out.push({ name: f.name, pix, headRow });
    if (f.view === 'right') out.push({ name: f.name.replace('right', 'left'), pix: pix.flipX(), headRow });
  }
  return out;
}

// ---------------------------------------------------------------- portraits (48x48)

const P = 48;

/** Fills a hair mask: from `top(x)` down to `bottom(x)` for each column, clipped to an ellipse. */
function hairShape(g: Grid, x0: number, x1: number, top: (x: number) => number, bottom: (x: number) => number, role = 'H') {
  for (let x = x0; x <= x1; x++) for (let y = top(x); y <= bottom(x); y++) g.set(x, y, role);
}

/** Top edge of the head ellipse at column x (the head spans x 12..35, rows 8..33). */
function headTopAt(x: number, lift = 0): number {
  const dx = (x + 0.5 - 24) / 12.5;
  return Math.round(21 - 13.5 * Math.sqrt(Math.max(0, 1 - dx * dx))) - lift;
}

function portraitHairBack(g: Grid, look: Look) {
  if (look.hair === 'hood') {
    g.ellipse(5, 2, 38, 42, 'T');
    g.ellipse(5, 2, 38, 42, 't').ellipse(4, 1, 36, 40, 'T', 't');
  }
  if (look.hair === 'ponytail') {
    g.ellipse(32, 14, 11, 24, 'H').ellipse(37, 16, 6, 20, 'h', 'H');
    g.rect(34, 15, 3, 3, 'A');
  }
  if (look.hair === 'messy' || look.hair === 'short') g.ellipse(10, 7, 28, 22, 'H');
  // A ring of hair around the back of the head, below the bald top.
  if (look.hair === 'horseshoe') g.ellipse(8, 6, 32, 29, 'H', undefined, 31, 13).ellipse(25, 6, 15, 29, 'h', 'H');
}

function portraitHairFront(g: Grid, look: Look) {
  const fringe = (x: number, base: number, wiggle: number[]) => base + wiggle[x % wiggle.length];
  switch (look.hair) {
    case 'short': {
      hairShape(g, 11, 36, (x) => headTopAt(x, 1), (x) => (x <= 13 || x >= 34 ? 24 : fringe(x, 14, [0, 1, 2, 1, 0, 1])));
      break;
    }
    case 'messy': {
      hairShape(g, 10, 37, (x) => headTopAt(x, 1), (x) => (x <= 13 || x >= 34 ? 25 : fringe(x, 15, [0, 2, 3, 1, 0, 2, 1])));
      // Spikes sticking up.
      for (const [sx, h] of [[12, 5], [16, 7], [21, 6], [26, 8], [31, 6], [35, 5]] as const) {
        for (let i = 0; i < h; i++) {
          const w = Math.max(1, Math.round((h - i) / 2));
          g.rect(sx - Math.floor(w / 2) + (i > h / 2 ? 1 : 0), headTopAt(sx) - i, w, 1, 'H');
        }
      }
      break;
    }
    case 'ponytail': {
      hairShape(g, 10, 37, (x) => headTopAt(x, 1), (x) => (x <= 13 || x >= 34 ? 31 : x === 23 || x === 24 ? 12 : fringe(x, 15, [0, 1, 1, 2, 1])));
      break;
    }
    case 'cap': {
      g.ellipse(11, 3, 26, 22, 'C', undefined, 14);
      g.rect(20, 7, 8, 6, 'A').rect(21, 8, 6, 4, 'a').rect(22, 9, 4, 2, 'A');
      g.rect(12, 18, 2, 5, 'H').rect(34, 18, 2, 5, 'h');
      g.ellipse(8, 13, 32, 7, 'V');
      g.rect(14, 19, 20, 1, 's', 'S');
      break;
    }
    case 'horseshoe': {
      g.rect(16, 11, 3, 2, 'L').rect(15, 13, 2, 2, 'L');
      g.ellipse(11, 14, 4, 6, 'H').ellipse(33, 14, 4, 6, 'h');
      break;
    }
    case 'combover': {
      g.rect(17, 10, 2, 2, 'L');
      for (const [y, x0, x1] of [[11, 20, 34], [13, 14, 35], [15, 13, 34]] as const) g.rect(x0, y, x1 - x0, 1, 'H').rect(x1 - 4, y + 1, 4, 1, 'h');
      g.ellipse(9, 14, 7, 15, 'H').ellipse(32, 14, 7, 15, 'H').ellipse(34, 16, 5, 13, 'h', 'H');
      break;
    }
    case 'beanie': {
      g.ellipse(10, 3, 28, 26, 'C', undefined, 15);
      for (let x = 13; x < 36; x += 4) g.rect(x, 5, 1, 12, 'c', 'C');
      g.rect(10, 14, 28, 6, 'V');
      for (let x = 12; x < 37; x += 4) g.rect(x, 14, 1, 6, 'c');
      g.ellipse(19, 0, 10, 7, 'W').ellipse(22, 3, 6, 4, 'w', 'W');
      g.rect(11, 20, 3, 5, 'H').rect(34, 20, 3, 5, 'h');
      break;
    }
    case 'hood': {
      // The hood's rim over the forehead and the sides of the face, a bit of fringe under it.
      g.ellipse(8, 3, 32, 22, 'T', undefined, 13);
      g.rect(8, 13, 5, 24, 'T').rect(35, 13, 5, 24, 't');
      g.rect(13, 13, 22, 1, 't').rect(13, 14, 1, 20, 't').rect(34, 14, 1, 20, 't');
      hairShape(g, 14, 33, () => 14, (x) => fringe(x, 15, [0, 1, 2, 1]));
      break;
    }
  }
}

function portraitTop(g: Grid, look: Look) {
  switch (look.top) {
    case 'tee':
      g.ellipse(17, 32, 14, 7, 't', 'T').ellipse(18, 31, 12, 6, 's', 'tT');
      break;
    case 'hoodie':
      if (look.hair !== 'hood') g.ellipse(12, 30, 24, 10, 't', 'T.').ellipse(13, 30, 22, 8, 'T', 'tT');
      g.ellipse(18, 31, 12, 6, 's', 'tT');
      g.rect(20, 36, 1, 8, 'A').rect(27, 36, 1, 8, 'A').rect(20, 44, 1, 1, 'a').rect(27, 44, 1, 1, 'a');
      break;
    case 'suit': {
      for (let y = 34; y < P; y++) {
        const half = Math.max(1, 7 - Math.floor((y - 34) / 2));
        g.rect(24 - half, y, half * 2, 1, 'W');
        g.set(24 - half - 1, y, 't').set(24 + half, y, 't');
      }
      g.rect(22, 35, 4, 3, 'A').rect(23, 38, 2, 10, 'A').rect(22, 41, 4, 7, 'A').rect(25, 38, 1, 10, 'a');
      break;
    }
    case 'cardigan':
      g.rect(19, 34, 10, 14, 'A').ellipse(18, 31, 12, 6, 's', 'TA');
      g.rect(18, 34, 1, 14, 'U').rect(29, 34, 1, 14, 't');
      g.rect(16, 39, 1, 1, 'W').rect(16, 43, 1, 1, 'W');
      break;
  }
  if (look.pack) g.rect(11, 36, 3, 12, 'B').rect(13, 36, 1, 12, 'b').rect(34, 36, 3, 12, 'b');
}

function portraitFace(g: Grid, look: Look) {
  const eyes = look.eyes ?? 'normal';
  for (const ex of [17, 28]) {
    g.rect(ex, 20, 3, 4, 'E').set(ex, 20, 'W');
    if (eyes === 'droopy') g.rect(ex - 1, 20, 5, 2, 's').rect(ex - 1, 21, 5, 1, 'm').rect(ex - 1, 24, 5, 1, 'k').rect(ex, 25, 3, 1, 'k');
  }
  // Brows.
  if (eyes === 'stern') {
    g.rect(15, 17, 5, 2, 'h').rect(20, 18, 2, 1, 'h').rect(28, 17, 5, 2, 'h').rect(26, 18, 2, 1, 'h');
  } else if (eyes === 'normal') {
    g.rect(16, 18, 5, 1, 'h').rect(27, 18, 5, 1, 'h');
  }
  // Nose and mouth.
  g.rect(24, 25, 1, 2, 's').set(23, 27, 's').set(25, 27, 's');
  if (look.mustache) {
    g.ellipse(18, 27, 12, 4, 'H').rect(18, 30, 12, 1, 'h', 'H').set(17, 30, 'H').set(30, 30, 'H');
    g.rect(22, 31, 4, 1, 'm');
  } else if (eyes === 'droopy') {
    g.rect(22, 30, 4, 1, 'm');
  } else {
    g.rect(21, 30, 6, 1, 'm').set(20, 29, 'm').set(27, 29, 'm');
  }
}

/** A 48x48 front-facing bust. */
export function characterPortrait(look: Look): Pix {
  const g = new Grid(P, P);
  portraitHairBack(g, look);
  // Shoulders and chest.
  g.ellipse(4, 36, 40, 26, 'T').rect(0, P - 1, P, 1, '.');
  g.ellipse(4, 36, 40, 26, 't', 'T').ellipse(2, 35, 38, 26, 'T', 't').ellipse(5, 37, 10, 8, 'U', 'T');
  if (look.build === 'big') g.ellipse(2, 34, 44, 28, 'T', '.').ellipse(4, 36, 42, 26, 't', 'T').ellipse(1, 35, 40, 26, 'T', 't');
  // Neck.
  g.rect(19, 28, 10, 9, 's');
  portraitTop(g, look);
  // Head with ears, shaded on the right.
  g.ellipse(8, 18, 7, 9, 'S').ellipse(33, 18, 7, 9, 's').ellipse(10, 20, 3, 5, 's', 'S');
  const wide = look.build === 'big' ? 2 : 0;
  g.ellipse(11 - wide, 8, 26 + wide * 2, 27 + wide, 's').ellipse(10 - wide, 7, 25 + wide * 2, 26 + wide, 'S', 's');
  portraitFace(g, look);
  portraitHairFront(g, look);
  if (look.mug) {
    g.rect(30, 37, 10, 10, 'W').rect(37, 37, 3, 10, 'w').rect(40, 39, 3, 1, 'w').rect(42, 39, 1, 5, 'w').rect(40, 43, 3, 1, 'w');
    g.rect(31, 37, 6, 2, 'O');
    g.rect(28, 40, 3, 6, 'S').rect(28, 41, 3, 1, 's').rect(28, 43, 3, 1, 's');
    g.rect(33, 32, 1, 2, 'x').rect(34, 30, 1, 2, 'x').rect(35, 33, 1, 2, 'x');
  }
  return g.toPix(paletteFor(look));
}

// ---------------------------------------------------------------- shadow and sack

/** Soft oval under everyone's feet (14x5 art px). */
export function shadowPix(): Pix {
  return fromRows(
    ['...oooooooo...', '.ooOOOOOOOOoo.', 'ooOOOOOOOOOOoo', '.ooOOOOOOOOoo.', '...oooooooo...'],
    { o: alpha(0x1a2030, 0.16), O: alpha(0x1a2030, 0.3) },
  );
}

/** Burlap scrap sack with copper pipe sticking out (12x14 art px). */
export function sackPix(): Pix {
  return fromRows(
    [
      '....o...o...',
      '...oO..oOo..',
      '....O..O.o..',
      '...rrrrrr...',
      '....rRRr....',
      '...BBBBBB...',
      '..BBUBBBBb..',
      '.BBUBBBBBBb.',
      '.BUBBBBBBBb.',
      '.BBBBBBbBBb.',
      '.BBBBBbBBbb.',
      '..bBBBBBbb..',
      '...bbbbbb...',
    ],
    {
      o: 0xf6b27a, O: 0xd9772f, r: 0x8a6a3a, R: 0xb08a50,
      B: 0xc8a165, U: 0xdcbb84, b: 0xa07d48,
    },
  ).outline(INK);
}

// ---------------------------------------------------------------- module

/**
 * Empty art pixels around every sheet frame. Frames packed edge to edge bleed into each other
 * when drawn at fractional zooms (thin lines over heads); CharacterView allows for this border.
 */
export const SHEET_PAD = 1;

/** Per-frame data on sheet frames (Phaser frame.customData), read by CharacterView. */
export interface SheetFrameData {
  /** Art px from the frame's top edge (border included) to the top of the head. */
  headRow?: number;
}

function padded(pix: Pix): Pix {
  return new Pix(pix.w + SHEET_PAD * 2, pix.h + SHEET_PAD * 2).draw(pix, SHEET_PAD, SHEET_PAD);
}

export const characterArt: ArtModule = {
  keys: () => [...Object.keys(LOOKS).flatMap((k) => [k, `${k}_sheet`, `${k}_big`]), 'shadow', 'sack'],
  paint: (textures: Phaser.Textures.TextureManager) => {
    for (const [key, look] of Object.entries(LOOKS)) {
      const frames = characterFrames(look);
      const sheet = addSheet(textures, `${key}_sheet`, frames.map((f) => ({ name: f.name, pix: padded(f.pix) })));
      for (const f of frames) (sheet.get(f.name).customData as SheetFrameData).headRow = SHEET_PAD + f.headRow;
      addTexture(textures, key, frames.find((f) => f.name === 'down-0')!.pix);
      addTexture(textures, `${key}_big`, characterPortrait(look));
    }
    addTexture(textures, 'shadow', shadowPix());
    addTexture(textures, 'sack', sackPix());
  },
};
