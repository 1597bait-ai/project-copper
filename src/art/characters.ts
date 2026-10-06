// Dalton, Tomothy, Dunkin, Mr. Gravy, the students and the sleepy coworker (see src/entities/CharacterView.ts for the texture contract).
// Placeholder: nothing drawn yet, so the old vector art in sprites.ts is used instead.

import type Phaser from 'phaser';
import type { ArtModule } from './index';

export const characterArt: ArtModule = {
  keys: () => [],
  paint: (_textures: Phaser.Textures.TextureManager) => {},
};
