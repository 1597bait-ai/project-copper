import Phaser from 'phaser';
import { rasterizeSprites } from '../art/rasterize';
import { allSprites } from '../art/sprites';
import { setMuted } from '../systems/sfx';
import { loadSave } from '../systems/save';
import { textStyle } from '../ui/theme';
import { MAPS, tilesetTextureKey } from '../world/maps';

/** Loads maps + tilesets and turns the SVG art into textures, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const label = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', textStyle(48)).setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => label.setText(`Loading… ${Math.round(v * 100)}%`));
    for (const map of MAPS) {
      this.load.tilemapTiledJSON(map.key, map.data);
      for (const [name, url] of Object.entries(map.tilesets)) this.load.image(tilesetTextureKey(name), url);
    }
  }

  async create(): Promise<void> {
    setMuted(loadSave().muted);
    await rasterizeSprites(this.textures, allSprites());
    this.scene.start('Menu');
  }
}
