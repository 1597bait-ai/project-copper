import Phaser from 'phaser';
import { BALANCE, bagCapacity, tilesPerSecond } from './config/balance';
import { activeTuning, applyTuning, readEmbeddedTuning } from './config/tuning';
import { BootScene } from './scenes/BootScene';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { ShiftEndScene } from './scenes/ShiftEndScene';
import { initStudio } from './studio';
import type { Studio } from './studio/Studio';

// The page carries the tuning saved in Copper Studio (src/studio/): apply it before anything reads the config.
const embedded = readEmbeddedTuning();
for (const warning of [...embedded.warnings, ...applyTuning(embedded.file)]) console.warn(`[tuning] ${warning}`);

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
  // The map editor lives in Copper Studio (its Map tab), which starts it.
  scene: [BootScene, MenuScene, GameScene, HudScene, ShiftEndScene, EditorScene],
});

// Copper Studio, the developer's balancing app: the menu's STUDIO button, #studio, or back from a save.
const studio = initStudio(game, embedded.file);

// Handy for debugging in the browser console and for the automated smoke test (which reads the
// tuning numbers from here, so editing src/config/balance.ts never breaks it).
declare global {
  interface Window {
    __COPPER__?: {
      game: Phaser.Game;
      balance: typeof BALANCE;
      rules: { tilesPerSecond: typeof tilesPerSecond; bagCapacity: typeof bagCapacity };
      tuning: typeof activeTuning;
      studio: Studio;
    };
  }
}
window.__COPPER__ = { game, balance: BALANCE, rules: { tilesPerSecond, bagCapacity }, tuning: activeTuning, studio };
