import { describe, expect, it } from 'vitest';
import { Grid } from './Grid';
import { findPath } from './pathfinding';
import { pickWanderTarget, wanderArea } from './wander';

const T = 64;

/** Small deterministic PRNG (mulberry32) so picks are repeatable. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// h = hallway (liked), o = office (not liked), # = wall, x = a solid fixture on hallway floor.
const rows = [
  '##############',
  '#hhhhhh#ooooo#',
  '#hhxhhhhooooo#',
  '#hhhhhh#ooooo#',
  '######h#######',
  '#hhhhhhhhhhhh#',
  '#hhhhhhhhhhhh#',
  '##############',
];
const grid = Grid.fromRows(
  rows.map((r) => r.replace(/x/g, '#')),
  T,
);
const likes = (tx: number, ty: number) => rows[ty]?.[tx] === 'h';
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

describe('wanderArea', () => {
  it('only holds open, liked tiles within the radius', () => {
    const home = { x: 2, y: 1 };
    const area = wanderArea(grid, home, 4, likes);
    expect(area.length).toBeGreaterThan(5);
    for (const t of area) {
      expect(grid.blocked(t.x, t.y)).toBe(false);
      expect(likes(t.x, t.y)).toBe(true);
      expect(Math.hypot(t.x - home.x, t.y - home.y)).toBeLessThanOrEqual(4);
    }
    expect(area.map(key)).not.toContain('3,2'); // the solid fixture
  });

  it('never wanders into rooms they do not like, even through an open doorway', () => {
    const area = wanderArea(grid, { x: 5, y: 2 }, 10, likes);
    expect(area.some((t) => rows[t.y][t.x] === 'o')).toBe(false);
    expect(area.map(key)).toContain('1,6'); // but the hallway past the gap is fine
  });

  it('every tile in the area can actually be walked to', () => {
    const home = { x: 1, y: 1 };
    for (const t of wanderArea(grid, home, 8, likes)) expect(findPath(grid, home.x, home.y, t.x, t.y), key(t)).not.toBeNull();
  });

  it('does not reach liked tiles that are only connected through disliked ones', () => {
    const sealed = ['#######', '#hhohh#', '#######'];
    const g = Grid.fromRows(sealed, T);
    const area = wanderArea(g, { x: 1, y: 1 }, 10, (x, y) => sealed[y]?.[x] === 'h');
    expect(area.map(key).sort()).toEqual(['1,1', '2,1']);
  });

  it('is empty when home is blocked', () => {
    expect(wanderArea(grid, { x: 0, y: 0 }, 5, likes)).toEqual([]);
  });
});

describe('pickWanderTarget', () => {
  const home = { x: 3, y: 5 };
  const area = wanderArea(grid, home, 8, likes);

  it('is repeatable with a seeded rng', () => {
    const a = seeded(42);
    const b = seeded(42);
    const runA = Array.from({ length: 10 }, () => pickWanderTarget(area, home, a));
    const runB = Array.from({ length: 10 }, () => pickWanderTarget(area, home, b));
    expect(runA).toEqual(runB);
  });

  it('picks from the area, away from where it stands', () => {
    const rng = seeded(7);
    const picked = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = pickWanderTarget(area, home, rng, 2)!;
      expect(area.map(key)).toContain(key(t));
      expect(Math.hypot(t.x - home.x, t.y - home.y)).toBeGreaterThanOrEqual(2);
      picked.add(key(t));
    }
    expect(picked.size).toBeGreaterThan(10); // it actually varies
  });

  it('falls back to nearby tiles when the area is tiny, and to null when empty', () => {
    const tiny = [{ x: 1, y: 1 }];
    expect(pickWanderTarget(tiny, { x: 1, y: 1 }, seeded(1), 3)).toEqual({ x: 1, y: 1 });
    expect(pickWanderTarget([], { x: 1, y: 1 }, seeded(1))).toBeNull();
  });

  it('copes with an rng that returns values at the edges', () => {
    expect(pickWanderTarget(area, home, () => 0)).not.toBeNull();
    expect(pickWanderTarget(area, home, () => 0.9999999)).not.toBeNull();
  });
});
