// How the game's scenes and Copper Studio talk: names on the Phaser game's events and registry.
// No imports, so a scene can use these without pulling in the Studio.

/** game.events: the menu's STUDIO button was pressed. */
export const OPEN_STUDIO = 'studio:open';

/** game.registry flag, and a game.events event: the art is drawn, so the map editor and the menu can start. */
export const ART_READY = 'copper:art-ready';

/** game.registry flag: the Studio covers the game, so Boot doesn't open the menu underneath it. */
export const STUDIO_OPEN = 'studio:covering';

/**
 * game.registry: where the HUD's windows are (game pixels; the menu and the end of a shift put the
 * corner balance label here), so the Studio's floating button keeps clear of them.
 */
export const HUD_LAYOUT = 'hud:layout';

export interface HudLayout {
  /** The game size the boxes are measured in. */
  width: number;
  height: number;
  boxes: { x: number; y: number; w: number; h: number }[];
}
