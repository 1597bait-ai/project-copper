// The tileset (floors, wall tops and wall faces for every tile in src/world/legend.ts).
// Placeholder: nothing drawn yet, so the old vector art in sprites.ts is used instead.

import type Phaser from 'phaser';
import type { ArtModule } from './index';

export const tileArt: ArtModule = {
  keys: () => [],
  paint: (_textures: Phaser.Textures.TextureManager) => {},
};
