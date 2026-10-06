// Decorations: plants, trash cans, trees and parked cars. Nobody can walk through them, but
// everyone can see past them (they're lower than eye level, or you can see between the leaves).
// To add one: add an entry here, give it a map character in src/world/legend.ts (DECOR_CHARS)
// and draw it in the art (src/art/).

export interface DecorDef {
  id: string;
  name: string;
  /** How it is listed in the map file legend. */
  mapName: string;
  /** Size in tiles. Bigger decorations are written as a filled w x h block of their character. */
  w: number;
  h: number;
}

export const DECOR: Record<string, DecorDef> = {
  plant: { id: 'plant', name: 'Potted plant', mapName: 'Potted plant', w: 1, h: 1 },
  trash_can: { id: 'trash_can', name: 'Trash can', mapName: 'Trash can', w: 1, h: 1 },
  tree: { id: 'tree', name: 'Tree', mapName: 'Tree', w: 1, h: 1 },
  car: { id: 'car', name: 'Parked car', mapName: 'Parked car (fill a 2x2 block)', w: 2, h: 2 },
};
