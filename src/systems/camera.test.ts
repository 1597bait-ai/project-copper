import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { markScale, tileCssPx } from './camera';

const C = BALANCE.camera;
const S = BALANCE.students;
/** The farthest a student can see Dalton from (tiles): on high alert. */
const reach = S.visionRangeTiles * S.highAlertRangeFactor;

describe('camera zoom on small screens', () => {
  it('shows every student who can see Dalton on a phone held upright (390 CSS px wide)', () => {
    const tile = tileCssPx(390, reach, C);
    // Dalton in the middle: from him to the screen edge, in tiles.
    expect(390 / 2 / tile).toBeGreaterThan(reach);
    // The old fixed 34 px tiles didn't (5.7 tiles).
    expect(390 / 2 / 34).toBeLessThan(reach);
  });

  it('never draws tiles smaller than the readable minimum, nor bigger than the maximum', () => {
    expect(tileCssPx(200, reach, C)).toBe(C.minTileCssPx);
    expect(tileCssPx(2000, reach, C)).toBe(C.maxTileCssPx);
    const mid = 2 * (reach + C.seeBeyondTiles) * 30;
    expect(tileCssPx(mid, reach, C)).toBeCloseTo(30);
  });

  it('keeps tiles readable but further out than the old fixed 34 px on phones', () => {
    expect(C.minTileCssPx).toBeGreaterThanOrEqual(20);
    expect(C.minTileCssPx).toBeLessThan(C.maxTileCssPx);
  });

  it('draws speech bubbles and marks bigger when zoomed out, never smaller', () => {
    expect(markScale(C.maxTileCssPx, C)).toBe(1);
    expect(markScale(64, C)).toBe(1);
    expect(markScale(C.maxTileCssPx / 2, C)).toBe(2);
  });
});
