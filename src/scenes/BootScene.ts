import Phaser from 'phaser';
import { generateArt } from '../art';
import { setMuted } from '../systems/sfx';
import { loadSave } from '../systems/save';
import { loadFonts, textStyle } from '../ui/theme';
import { TILESET_TEXTURE, TILESET_URL } from '../world/maps';

/** Loads the tileset, the font and draws the art into textures, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const label = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', textStyle(48)).setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => label.setText(`Loading… ${Math.round(v * 100)}%`));
    this.load.image(TILESET_TEXTURE, TILESET_URL);
  }

  async create(): Promise<void> {
    setMuted(loadSave().muted);
    await Promise.all([generateArt(this.textures), loadFonts()]);
    this.scene.start('Menu');
  }
}
