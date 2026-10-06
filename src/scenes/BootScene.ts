import Phaser from 'phaser';
import { generateArt } from '../art';
import { setMuted } from '../systems/sfx';
import { loadSave } from '../systems/save';
import { loadFonts, textStyle } from '../ui/theme';

/** Draws all the art (tileset, sprites) into textures and waits for the font, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', textStyle(48)).setOrigin(0.5);
    setMuted(loadSave().muted);
    await Promise.all([generateArt(this.textures), loadFonts()]);
    this.scene.start('Menu');
  }
}
