// What each character in a map file means. Maps are plain text: one character = one 64px tile.
// The tile ORDER must match the art in tools/tiles.mjs (the PNG is cut up by position);
// src/world/legend.test.ts checks that.

import { DECOR } from '../config/decor';

export type TileLayer = 'floor' | 'walls';

/** Room kinds drive the HUD location name and where students like to hang out. */
export type RoomKind =
  | 'hallway'
  | 'classroom'
  | 'restroom'
  | 'boiler'
  | 'office'
  | 'janitor'
  | 'lobby'
  | 'storage'
  | 'lounge'
  | 'outside';

export interface TileDef {
  char: string;
  name: string;
  layer: TileLayer;
  /** Walls block movement and sight. */
  collides?: boolean;
  /** Floors belong to a kind of room. */
  room?: RoomKind;
}

/** Index in this list = frame in school-tiles.png. */
export const TILES: TileDef[] = [
  { char: '.', name: 'Hallway floor', layer: 'floor', room: 'hallway' },
  { char: ',', name: 'Classroom carpet', layer: 'floor', room: 'classroom' },
  { char: '~', name: 'Restroom tile (blue)', layer: 'floor', room: 'restroom' },
  { char: 'b', name: 'Boiler room concrete', layer: 'floor', room: 'boiler' },
  { char: 'o', name: 'Office carpet', layer: 'floor', room: 'office' },
  { char: 'j', name: "Janitor's concrete", layer: 'floor', room: 'janitor' },
  { char: 'p', name: 'Asphalt', layer: 'floor', room: 'outside' },
  { char: '|', name: 'Parking line', layer: 'floor', room: 'outside' },
  { char: '_', name: 'Sidewalk', layer: 'floor', room: 'outside' },
  { char: 'g', name: 'Grass', layer: 'floor', room: 'outside' },
  { char: '#', name: 'Interior wall', layer: 'walls', collides: true },
  { char: 'B', name: 'Brick wall', layer: 'walls', collides: true },
  { char: 'F', name: 'Fence', layer: 'walls', collides: true },
  { char: '=', name: 'Lobby terrazzo', layer: 'floor', room: 'lobby' },
  { char: 'k', name: 'Storage plywood', layer: 'floor', room: 'storage' },
  { char: 'n', name: 'Lounge linoleum', layer: 'floor', room: 'lounge' },
  { char: 'W', name: 'Whiteboard wall', layer: 'walls', collides: true },
  { char: '^', name: 'Restroom tile (pink)', layer: 'floor', room: 'restroom' },
];

export const TILE_INDEX: Record<string, number> = Object.fromEntries(TILES.map((t, i) => [t.char, i]));
export const tileByChar = (ch: string): TileDef | undefined => TILES[TILE_INDEX[ch]];
export const isWallChar = (ch: string) => tileByChar(ch)?.layer === 'walls';
export const isFloorChar = (ch: string) => tileByChar(ch)?.layer === 'floor';

/** Scrappable fixtures: map character -> fixture id in src/config/fixtures.ts. */
export const FIXTURE_CHARS: Record<string, string> = {
  f: 'drinking_fountain',
  h: 'wall_heater',
  t: 'toilet',
  m: 'mop_sink',
  c: 'abandoned_copper_pile',
  d: 'desk',
  l: 'lamp',
  e: 'electric_panel',
};

/** Decorations: solid (nobody walks through them) but see-through. Map character -> id in src/config/decor.ts. */
export const DECOR_CHARS: Record<string, string> = {
  '*': 'plant',
  u: 'trash_can',
  T: 'tree',
  C: 'car',
};

export type ObjectKind = 'player' | 'boss' | 'student' | 'van' | 'door' | 'patrol' | 'fixture' | 'decor';

export interface ObjectDef {
  char: string;
  kind: ObjectKind;
  name: string;
}

/** Things placed on top of a floor. The floor under them comes from a neighbouring tile. */
export const OBJECTS: ObjectDef[] = [
  { char: 'P', kind: 'player', name: 'Player start' },
  { char: 'G', kind: 'boss', name: 'Mr. Gravy start' },
  { char: 'S', kind: 'student', name: 'Student' },
  { char: 'V', kind: 'van', name: 'Van (fill a 2x4 or 4x2 block)' },
  { char: 'L', kind: 'door', name: 'Locked door' },
  ...'123456789'.split('').map((d) => ({ char: d, kind: 'patrol' as const, name: `Mr. Gravy's route, stop ${d}` })),
  ...Object.entries(FIXTURE_CHARS).map(([char, id]) => ({ char, kind: 'fixture' as const, name: id })),
  ...Object.entries(DECOR_CHARS).map(([char, id]) => ({ char, kind: 'decor' as const, name: DECOR[id].mapName })),
];

export const OBJECT_BY_CHAR: Record<string, ObjectDef> = Object.fromEntries(OBJECTS.map((o) => [o.char, o]));
export const isObjectChar = (ch: string) => ch in OBJECT_BY_CHAR;

/** Default names for rooms of each kind ("@ x,y Name" lines in a map file override them). */
export const ROOM_NAMES: Record<RoomKind, (n: number) => string> = {
  hallway: () => 'Hallway',
  classroom: (n) => `Room ${100 + n}`,
  restroom: (n) => (n === 1 ? "Boys' Restroom" : n === 2 ? "Girls' Restroom" : `Restroom ${n}`),
  boiler: (n) => (n === 1 ? 'Boiler Room' : `Mechanical Room ${n - 1}`),
  office: () => "Mr. Gravy's Office",
  janitor: () => "Janitor's Closet",
  lobby: () => 'Front Lobby',
  storage: (n) => (n === 1 ? 'Storage Room' : `Storage Room ${n}`),
  lounge: () => "Teachers' Lounge",
  outside: () => 'Parking Lot',
};
