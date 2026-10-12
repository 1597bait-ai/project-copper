import { describe, expect, it } from 'vitest';
import { edgeSpot, inSight, spreadOut } from './edgeMarkers';

const screen = { x: 0, y: 0, w: 1000, h: 600 };
// The part of the screen markers use (below the HUD's top row, above its buttons).
const area = { x: 20, y: 100, w: 960, h: 400 };
const me = { x: 500, y: 300 };

describe('edge markers: who needs one', () => {
  it('nobody on screen and in the open', () => {
    expect(inSight({ x: 700, y: 400 }, screen, [])).toBe(true);
  });

  it('anyone off screen', () => {
    expect(inSight({ x: -10, y: 300 }, screen, [])).toBe(false);
    expect(inSight({ x: 500, y: 650 }, screen, [])).toBe(false);
  });

  it('anyone under one of the HUD windows', () => {
    const status = { x: 0, y: 0, w: 300, h: 120 };
    expect(inSight({ x: 100, y: 60 }, screen, [status])).toBe(false);
    expect(inSight({ x: 400, y: 60 }, screen, [status])).toBe(true);
  });
});

describe('edge markers: where they go', () => {
  it('on the edge straight towards them', () => {
    expect(edgeSpot(me, { x: 2000, y: 300 }, area)).toEqual({ x: 980, y: 300, side: 'right' });
    expect(edgeSpot(me, { x: -900, y: 300 }, area)).toEqual({ x: 20, y: 300, side: 'left' });
    expect(edgeSpot(me, { x: 500, y: -50 }, area)).toEqual({ x: 500, y: 100, side: 'top' });
    expect(edgeSpot(me, { x: 500, y: 9000 }, area)).toEqual({ x: 500, y: 500, side: 'bottom' });
  });

  it('along the line to them, on whichever edge it crosses first', () => {
    const s = edgeSpot(me, { x: 1500, y: -200 }, area);
    // Up and to the right, steeper than the area's corner: the top edge.
    expect(s.side).toBe('top');
    expect(s.y).toBe(100);
    expect(s.x).toBeCloseTo(500 + 1000 * (200 / 500));
  });

  it('points at someone hidden under a window from inside the area', () => {
    // Under the status window in the top-left corner.
    const s = edgeSpot(me, { x: 100, y: 60 }, area);
    expect(s.side).toBe('top');
    expect(s.x).toBeGreaterThan(100);
    expect(s.x).toBeLessThan(500);
  });

  it('works even when Dalton is outside the area', () => {
    const s = edgeSpot({ x: 500, y: 50 }, { x: 500, y: -300 }, area);
    expect(s).toEqual({ x: 500, y: 100, side: 'top' });
  });

  it('keeps one marker for a crowd in one direction, the most urgent', () => {
    const kept = spreadOut(
      [
        { x: 980, y: 300, id: 'yelling' },
        { x: 980, y: 320, id: 'unsure' },
        { x: 20, y: 300, id: 'other side' },
      ],
      48,
    );
    expect(kept.map((k) => k.id)).toEqual(['yelling', 'other side']);
  });
});
