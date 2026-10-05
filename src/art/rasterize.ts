import Phaser from 'phaser';
import type { SpriteDef } from './sprites';

/** Draws each SVG into a canvas and registers it as a Phaser texture. No network requests. */
export async function rasterizeSprites(textures: Phaser.Textures.TextureManager, sprites: SpriteDef[]): Promise<void> {
  await Promise.all(
    sprites.map(async (s) => {
      if (textures.exists(s.key)) return;
      const img = new Image(s.width, s.height);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg);
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = s.width;
      canvas.height = s.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, s.width, s.height);
      textures.addCanvas(s.key, canvas);
    }),
  );
}
