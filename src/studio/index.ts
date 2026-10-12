// Copper Studio's place in the game page. It opens from the menu's STUDIO button (offered to whoever
// can save: the game's owner on claude.ai, or the dev server), from #studio in the address (for
// anyone; saving stays off when they can't), and by itself after a save reloaded the page.

import type Phaser from 'phaser';
import type { TuningFile } from '../config/tuning';
import { saveEnv } from './access';
import { takeSession } from './draft';
import { OPEN_STUDIO } from './hooks';
import { sessionStore } from './storage';
import { Studio } from './Studio';

const wantsStudio = () => /^#studio\b/i.test(location.hash);

export function initStudio(game: Phaser.Game, saved: TuningFile): Studio {
  // Ask early: the menu needs to know whether to offer the Studio.
  void saveEnv();
  const session = takeSession(sessionStore(), Date.now());
  const studio = new Studio(game, saved, session);
  // Sent from inside the menu's input handling: switch scenes once that is done.
  game.events.on(OPEN_STUDIO, () => setTimeout(() => studio.open(), 0));
  window.addEventListener('hashchange', () => {
    if (wantsStudio()) studio.open();
  });
  if (session || wantsStudio()) studio.open(session?.tab);
  return studio;
}
