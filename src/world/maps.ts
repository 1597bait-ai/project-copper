import school01 from '../assets/maps/school-01.json';
import schoolTiles from '../assets/tiles/school-tiles.png';

// Every playable map. Add a level by drawing it in Tiled (or tools/maps/*.txt + `npm run map`)
// and listing it here.

export interface MapEntry {
  key: string;
  name: string;
  data: object;
  /** Tileset name inside the Tiled file -> image URL. */
  tilesets: Record<string, string>;
}

export const MAPS: MapEntry[] = [
  {
    key: 'school-01',
    name: 'Lincoln Middle School',
    data: school01,
    tilesets: { school: schoolTiles },
  },
];

export const tilesetTextureKey = (name: string) => `tileset-${name}`;
