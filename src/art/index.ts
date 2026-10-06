// All the game's art, generated in code at boot (no image files to load): pixel art drawn on
// small buffers (see pixel.ts) and turned into textures. Each module draws one part of it.

import type Phaser from 'phaser';
import { characterArt } from './characters';
import { objectArt } from './objects';
import { rasterizeSprites } from './rasterize';
import { allSprites } from './sprites';
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
  return [...new Set([...ART_MODULES.flatMap((m) => m.keys()), ...allSprites().map((s) => s.key)])];
}

/** Makes every texture. Anything not drawn as pixel art yet falls back to the old vector art. */
export async function generateArt(textures: Phaser.Textures.TextureManager): Promise<void> {
  for (const m of ART_MODULES) m.paint(textures);
  await rasterizeSprites(
    textures,
    allSprites().filter((s) => !textures.exists(s.key)),
  );
}
