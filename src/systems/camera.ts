// How far the game camera zooms in. Pure, so it can be unit tested; GameScene.fitCamera uses it.

export interface CameraTuning {
  /** Tiles Dalton should see past the farthest a student can see him from (high alert). */
  seeBeyondTiles: number;
  /** A tile is never drawn smaller than this (CSS px), so people and their speech stay readable. */
  minTileCssPx: number;
  /** ...nor bigger than this on a small screen (big screens show the map 1:1 anyway). */
  maxTileCssPx: number;
}

/**
 * How wide (CSS px) to draw a tile on a screen whose short side is `shortSideCss` CSS px: small
 * enough that from Dalton (in the middle) to the nearer screen edge there are `reachTiles` plus
 * `seeBeyondTiles`, so a student who can see him is on screen too, within the readable range.
 */
export function tileCssPx(shortSideCss: number, reachTiles: number, t: CameraTuning): number {
  const fit = shortSideCss / (2 * (reachTiles + t.seeBeyondTiles));
  return Math.min(t.maxTileCssPx, Math.max(t.minTileCssPx, fit));
}

/**
 * Speech bubbles, '!' marks and floating text are drawn this much bigger than normal when the
 * camera zooms out past maxTileCssPx-sized tiles, so they keep the size they'd have there on screen.
 */
export function markScale(tileCss: number, t: CameraTuning): number {
  return Math.max(1, t.maxTileCssPx / tileCss);
}
