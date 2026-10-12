import { describe, expect, it } from 'vitest';
import { topCentreSpot, type Box } from './spot';

const overlaps = (a: Box, b: Box, gap: number) => a.x < b.x + b.w + gap && a.x + a.w > b.x - gap && a.y < b.y + b.h + gap && a.y + a.h > b.y - gap;

describe('the floating STUDIO button', () => {
  it('sits at the top centre when nothing is in the way', () => {
    expect(topCentreSpot(1600, 900, 100, 34, [])).toEqual({ x: 750, y: 8 });
  });

  it('steps beside a window at the top centre, staying at the top', () => {
    // A desktop HUD: status window, clock in the middle, warnings and pause on the right.
    const hud: Box[] = [
      { x: 20, y: 20, w: 367, h: 140 },
      { x: 667, y: 20, w: 266, h: 87 },
      { x: 1277, y: 20, w: 208, h: 87 },
      { x: 1497, y: 20, w: 83, h: 87 },
    ];
    const spot = topCentreSpot(1600, 900, 100, 34, hud);
    expect(spot.y).toBe(8);
    const button = { ...spot, w: 100, h: 34 };
    for (const b of hud) expect(overlaps(button, b, 8)).toBe(false);
    // As near the middle as it gets: against the clock's left or right side.
    expect([667 - 8 - 100, 933 + 8]).toContain(spot.x);
  });

  it('goes below a row that leaves no room', () => {
    // An upright phone: the top row is full, the clock sits under it in the middle.
    const hud: Box[] = [
      { x: 10, y: 10, w: 195, h: 75 },
      { x: 210, y: 10, w: 170, h: 47 },
      { x: 124, y: 92, w: 142, h: 46 },
    ];
    const spot = topCentreSpot(390, 844, 100, 36, hud);
    const button = { ...spot, w: 100, h: 36 };
    for (const b of hud) expect(overlaps(button, b, 8)).toBe(false);
    expect(spot.y).toBeLessThan(140);
    expect(spot.x + 100).toBeLessThanOrEqual(390 - 8);
  });

  it('never overlaps anything, whatever the layout', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const W = 300 + rand() * 1700;
      const H = 300 + rand() * 900;
      const boxes: Box[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({ x: rand() * W, y: rand() * H * 0.4, w: 20 + rand() * W * 0.3, h: 20 + rand() * 120 }));
      const spot = topCentreSpot(W, H, 96, 34, boxes);
      const button = { ...spot, w: 96, h: 34 };
      const free = boxes.every((b) => !overlaps(button, b, 7.9));
      // When nothing in the top half fits it falls back to the top centre.
      if (!free) expect(spot).toEqual({ x: (W - 96) / 2, y: 8 });
    }
  });
});
