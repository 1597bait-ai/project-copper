import lincoln from '../assets/maps/lincoln.txt?raw';
import { tunedMapText } from '../config/tuning';

// The maps. A map is a plain text file (see src/world/mapText.ts for the format and
// src/world/legend.ts for the characters). Edit one in any text editor or with the map editor in
// Copper Studio. Every map listed here is checked by `npm test`; the game plays the first one,
// unless a map saved in the Studio replaces it (currentMapText).

export interface MapEntry {
  key: string;
  name: string;
  text: string;
}

export const MAPS: MapEntry[] = [{ key: 'lincoln', name: 'Lincoln Middle School', text: lincoln }];

export const DEFAULT_MAP = MAPS[0];

/** The map the game plays: the one saved in Copper Studio, or the built-in school. */
export function currentMapText(): string {
  return tunedMapText() ?? DEFAULT_MAP.text;
}

/** The tileset is drawn in code at boot (src/art/tiles.ts); see src/world/autotile.ts for its frames. */
export { TILESET_TEXTURE } from './autotile';
