// Decorations: plants, trash cans, trees, parked cars, the boiler room's machines and restroom
// sinks. Nobody can walk through them, but everyone can see past them (only walls and closed doors
// block sight, so they never make a hiding place).
// To add one: add an entry here, give it a map character in src/world/legend.ts (DECOR_CHARS)
// and draw it under the same key in objectPix() (src/art/objects.ts).

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
  // Scrappable, unlike the rest: the world builds it as the gravy_truck fixture (src/config/fixtures.ts).
  gravy_truck: { id: 'gravy_truck', name: "Mr. Gravy's truck", mapName: "Mr. Gravy's truck (fill a 2x2 block)", w: 2, h: 2 },
  boiler: { id: 'boiler', name: 'Boiler', mapName: 'Boiler (fill a 2x2 block)', w: 2, h: 2 },
  generator: { id: 'generator', name: 'Generator', mapName: 'Generator (fill a 2x1 block)', w: 2, h: 1 },
  pressure_gauges: { id: 'pressure_gauges', name: 'Pressure gauges', mapName: 'Pressure gauges', w: 1, h: 1 },
  sink: { id: 'sink', name: 'Sink', mapName: 'Sink (with a wall above it)', w: 1, h: 1 },
};
