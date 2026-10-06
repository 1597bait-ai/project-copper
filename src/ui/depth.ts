// Draw order for everything in the game world (the HUD is a separate scene on top).
//
// Things that stand on the floor (people, furniture, fixtures, the van, trees, cars) are sorted by
// where their feet are: whoever is lower on screen is drawn in front, so a tall sprite can overlap
// whatever stands behind it. Use sortDepth(feetY) for those.

export const DEPTH = {
  floor: 0,
  walls: 1,
  doors: 3,
  /** Highlight under a fixture you can scrap. */
  glow: 4,
  /** Vision cones lie on the floor, under everyone. */
  cones: 7,
  /** sortDepth() values sit between this and sortedBase + 1. */
  sortedBase: 10,
  bubbles: 19,
  marks: 20,
  channelBar: 25,
  floatText: 30,
} as const;

/** Depth for something standing with its feet at world y (maps up to 100,000 px tall). */
export function sortDepth(feetY: number): number {
  return DEPTH.sortedBase + Math.max(0, Math.min(99_999, feetY)) / 100_000;
}
