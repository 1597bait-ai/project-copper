import { describe, expect, it } from 'vitest';
import { clockText } from './clock';
import { Grid } from './Grid';
import { findPath, smoothPath } from './pathfinding';
import { castRay, inCone } from './vision';

const T = 64;
const room = Grid.fromRows(
  [
    '##########',
    '#........#',
    '#..####..#',
    '#..#.....#',
    '#..#.....#',
    '##########',
  ],
  T,
);

describe('pathfinding', () => {
  it('finds a way around walls', () => {
    const path = findPath(room, 1, 4, 5, 4)!;
    expect(path[0]).toEqual({ x: 1, y: 4 });
    expect(path[path.length - 1]).toEqual({ x: 5, y: 4 });
    for (const p of path) expect(room.blocked(p.x, p.y)).toBe(false);
  });

  it('never cuts a corner diagonally past a wall', () => {
    const path = findPath(room, 2, 3, 4, 1)!;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.x !== b.x && a.y !== b.y) {
        expect(room.blocked(b.x, a.y) || room.blocked(a.x, b.y)).toBe(false);
      }
    }
  });

  it('returns null when sealed off', () => {
    const sealed = Grid.fromRows(['#####', '#.#.#', '#####'], T);
    expect(findPath(sealed, 1, 1, 3, 1)).toBeNull();
  });

  it('smoothing drops unnecessary corners in open space', () => {
    const open = Grid.fromRows(['#######', '#.....#', '#.....#', '#.....#', '#######'], T);
    const tiles = findPath(open, 1, 1, 5, 3)!;
    const smooth = smoothPath(open, tiles, T * 0.3);
    expect(smooth.length).toBeLessThan(tiles.length);
    expect(smooth.length).toBe(2);
  });
});

describe('vision', () => {
  it('rays stop at walls', () => {
    // From the middle of tile (1,1) looking right, the wall at x=9 starts at 9*64.
    expect(castRay(room, 1.5 * T, 1.5 * T, 0, 2000)).toBeCloseTo(9 * T - 1.5 * T);
    expect(castRay(room, 1.5 * T, 1.5 * T, 0, 100)).toBe(100);
  });

  it('cone sees in front, not behind or through walls', () => {
    const cone = { origin: { x: 1.5 * T, y: 1.5 * T }, facing: 0, range: 6 * T, halfAngle: Math.PI / 4 };
    expect(inCone(room, cone, { x: 5.5 * T, y: 1.5 * T })).toBe(true);
    expect(inCone(room, { ...cone, facing: Math.PI }, { x: 5.5 * T, y: 1.5 * T })).toBe(false);
    // (5,4) is behind the wall block at row 2.
    expect(inCone(room, { ...cone, facing: Math.atan2(2.5, 4) }, { x: 5.5 * T, y: 4 * T })).toBe(false);
  });
});

describe('shift clock', () => {
  it('runs 7 AM to 3 PM in five-minute ticks', () => {
    expect(clockText(0)).toBe('7:00 AM');
    expect(clockText(0.5)).toBe('11:00 AM');
    expect(clockText(0.625)).toBe('12:00 PM');
    expect(clockText(1)).toBe('3:00 PM');
    expect(clockText(0.01)).toBe('7:00 AM');
    expect(clockText(0.0105)).toBe('7:05 AM');
  });
});
