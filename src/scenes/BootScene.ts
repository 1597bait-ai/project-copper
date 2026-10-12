import Phaser from 'phaser';
import { generateArt } from '../art';
import { ART_READY, STUDIO_OPEN } from '../studio/hooks';
import { setMuted } from '../systems/sfx';
import { loadSave } from '../systems/save';
import { cssPerGamePixel, loadFonts, textStyle } from '../ui/theme';

/** Resolves once the browser has drawn another frame, so a text changed just before is on screen. */
function nextFrame(): Promise<void> {
  // A background tab draws no frames: don't wait for one there.
  if (document.hidden) return Promise.resolve();
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
}

/** Waits for the fonts, draws all the art (tileset, sprites) into textures, then opens the menu (unless Copper Studio is up). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    setMuted(loadSave().muted);
    // The fonts come with the game, so this is quick, and the loading text is already in the pixel font.
    await loadFonts();
    // About 28 CSS pixels tall even on a phone, where a game pixel is a fraction of a screen pixel.
    const size = Math.max(48, Math.round(28 / cssPerGamePixel(this.scale)));
    const label = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Loading…', textStyle(size)).setOrigin(0.5);
    // Drawing the art takes a moment (seconds on a slow phone): say how far along it is.
    await generateArt(this.textures, (done, total) => {
      label.setText(`Loading… ${Math.round((100 * done) / total)}%`);
      return nextFrame();
    });
    this.registry.set(ART_READY, true);
    this.game.events.emit(ART_READY);
    // The Studio opened while the art was drawing (#studio, or back from a save): it starts the menu when it closes.
    if (this.registry.get(STUDIO_OPEN)) this.scene.stop();
    else this.scene.start('Menu');
  }
}
