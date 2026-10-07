// HUD icons, drawn as pixel art like everything else (see pixel.ts). Windows and the menu
// cursor are drawn with Graphics in src/ui/theme.ts so they can be any size.

import type Phaser from 'phaser';
import type { ArtModule } from './index';
import { Pix, addTexture, fromRows, type Color } from './pixel';

const INK = 0x283050;

/** Icon texture keys used by the HUD. */
export const UI_ICONS = {
  coin: 'ui_coin',
  bag: 'ui_bag',
  clock: 'ui_clock',
  pin: 'ui_pin',
  strikeOn: 'ui_strike_on',
  strikeOff: 'ui_strike_off',
  alert: 'ui_alert',
  star: 'ui_star',
} as const;

function coin(): Pix {
  const p = new Pix(12, 12);
  p.ellipse(0, 0, 12, 12, 0x8a5a14);
  p.ellipse(1, 1, 10, 10, 0xf2c23a);
  // Light from the top-left, shade bottom-right.
  p.rect(3, 2, 3, 1, 0xfff0a0).rect(2, 3, 1, 3, 0xfff0a0);
  p.rect(9, 6, 1, 3, 0xc88a1c).rect(6, 9, 3, 1, 0xc88a1c);
  p.rows(['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'], { '#': 0x9a6410 }, 4, 2);
  return p;
}

function bag(): Pix {
  return fromRows(
    [
      '....oooo....',
      '...ohhbbo...',
      '....obbo....',
      '...oorroo...',
      '..ohhbbbbo..',
      '.ohbbbbbbso.',
      'ohbbbbbbbbso',
      'ohbbbbbbbbso',
      'obbbbbbbbsso',
      'obbbbbbbssso',
      '.osssssssso.',
      '..oooooooo..',
    ],
    { o: 0x4a3020, b: 0xc89858, h: 0xe8c488, s: 0x9c6c3c, r: 0xd04a3a },
  );
}

function clock(): Pix {
  return fromRows(
    [
      '...oooooo...',
      '..owwwwwwo..',
      '.owwwnwwwwo.',
      'owwwwnwwwwgo',
      'owwwwnwwwwgo',
      'owwwwnwwwwgo',
      'owwwwnnnwwgo',
      'owwwwwwwwwgo',
      'owwwwwwwwwgo',
      '.owwwwwwwgo.',
      '..oggggggo..',
      '...oooooo...',
    ],
    { o: INK, w: 0xf8f8f0, g: 0xc8ccd8, n: 0xd04a3a },
  );
}

function pin(): Pix {
  return fromRows(
    [
      '..ooooo..',
      '.orrrrro.',
      'orhhrrrdo',
      'orhwwrrdo',
      'orrwwrrdo',
      'orrrrrddo',
      '.orrrddo.',
      '..ordo...',
      '..oddo...',
      '...oo....',
      '...o.....',
    ],
    { o: INK, r: 0xe0483a, h: 0xff8a70, d: 0xa82a24, w: 0xffffff },
  );
}

function strike(on: boolean): Pix {
  const p = new Pix(12, 12);
  p.ellipse(0, 0, 12, 12, INK);
  if (on) {
    p.ellipse(1, 1, 10, 10, 0xe0483a);
    p.rect(3, 2, 3, 1, 0xff9a80).rect(2, 3, 1, 2, 0xff9a80);
    p.rect(8, 7, 1, 2, 0xa82a24).rect(6, 9, 3, 1, 0xa82a24);
    p.rect(5, 3, 2, 4, 0xffffff).rect(5, 8, 2, 1, 0xffffff);
  } else {
    p.ellipse(1, 1, 10, 10, 0xb8c0d0);
    p.ellipse(3, 3, 6, 6, 0x9aa2b8);
  }
  return p;
}

function alertMark(): Pix {
  return fromRows(
    [
      '.oooo.',
      'oyyyyo',
      'oyyyyo',
      'oyyyyo',
      '.oyyo.',
      '.oyyo.',
      '.oyyo.',
      '..oo..',
      '.oooo.',
      'oyyyyo',
      'oyyyyo',
      '.oooo.',
    ],
    { o: 0x5a1010, y: 0xffe060 },
  );
}

function star(): Pix {
  return fromRows(
    [
      '.....o.....',
      '....oyo....',
      '....oyo....',
      'ooooyyyoooo',
      'oyyyyyyyyyo',
      '.oyyyyyyyo.',
      '..oyyyyyo..',
      '..oyyoyyo..',
      '.oyyo.oyyo.',
      '.ooo...ooo.',
    ],
    { o: 0x4a2a7a, y: 0xd8b8ff } satisfies Record<string, Color>,
  );
}

/** Every UI icon as pixel art (pure data: unit tested without a browser). */
export function uiPix(): Record<string, Pix> {
  return {
    [UI_ICONS.coin]: coin(),
    [UI_ICONS.bag]: bag(),
    [UI_ICONS.clock]: clock(),
    [UI_ICONS.pin]: pin(),
    [UI_ICONS.strikeOn]: strike(true),
    [UI_ICONS.strikeOff]: strike(false),
    [UI_ICONS.alert]: alertMark(),
    [UI_ICONS.star]: star(),
  };
}

export const uiArt: ArtModule = {
  keys: () => Object.values(UI_ICONS),
  paint: (textures: Phaser.Textures.TextureManager) => {
    for (const [key, pix] of Object.entries(uiPix())) addTexture(textures, key, pix);
  },
};
