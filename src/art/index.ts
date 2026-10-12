// All the game's art, generated in code at boot (no image files to load): pixel art drawn on
// small buffers (see pixel.ts) and turned into textures. Each module draws one part of it.

import type Phaser from 'phaser';
import { characterArt } from './characters';
import { objectArt } from './objects';
import { tileArt } from './tiles';
import { uiArt } from './ui';

export interface ArtModule {
  /** Every texture key this module makes (checked by the unit tests; no browser needed). */
  keys(): string[];
  /** Draws the textures. */
  paint(textures: Phaser.Textures.TextureManager): void;
}

export const ART_MODULES: ArtModule[] = [tileArt, objectArt, characterArt, uiArt];

/** Every texture key the art provides. */
export function artKeys(): string[] {
  return [...new Set(ART_MODULES.flatMap((m) => m.keys()))];
}

/**
 * Makes every texture, one module at a time. Drawing a module blocks the page for a moment (up
 * to a second on a slow phone), so before each one it waits for `beforeEach(done, total)`: the
 * boot screen shows its progress there and lets the browser draw it.
 */
export async function generateArt(
  textures: Phaser.Textures.TextureManager,
  beforeEach: (done: number, total: number) => void | Promise<void> = () => {},
): Promise<void> {
  for (const [i, m] of ART_MODULES.entries()) {
    await beforeEach(i, ART_MODULES.length);
    m.paint(textures);
  }
}
