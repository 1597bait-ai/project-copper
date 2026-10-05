import lincoln from '../assets/maps/lincoln.txt?raw';
import schoolTiles from '../assets/tiles/school-tiles.png';

// Every playable map. A map is a plain text file (see src/world/mapText.ts for the format and
// src/world/legend.ts for the characters). Edit one in any text editor or with the in-game
// map editor, then list new ones here.

export interface MapEntry {
  key: string;
  name: string;
  text: string;
}

export const MAPS: MapEntry[] = [{ key: 'lincoln', name: 'Lincoln Middle School', text: lincoln }];

export const DEFAULT_MAP = MAPS[0];

export const TILESET_TEXTURE = 'tileset-school';
export const TILESET_URL = schoolTiles;
