import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { ShiftEndScene } from './scenes/ShiftEndScene';

// The game is laid out at 1920x1080 and EXPANDs to fill any landscape screen (phones, tablets,
// monitors) without letterboxing: wider screens simply see more of the school.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14161c',
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1920,
    height: 1080,
  },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { activePointers: 4, gamepad: true },
  scene: [BootScene, MenuScene, GameScene, HudScene, ShiftEndScene, EditorScene],
});

// Handy for debugging in the browser console and for the automated smoke test.
declare global {
  interface Window {
    __COPPER__?: { game: Phaser.Game };
  }
}
window.__COPPER__ = { game };
