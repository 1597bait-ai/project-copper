import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { Grid } from './Grid';
import {
  EDGE,
  FADE_FROM,
  SEEN_LEVEL,
  applyMatrix,
  distanceFalloff,
  edgeFalloff,
  exploreFrom,
  footprintSpots,
  inSight,
  memoryMatrix,
  seesSpot,
  shadowTriangles,
  sightRay,
  viewLevel,
  viewRays,
  viewReach,
  type ViewShape,
} from './fog';

const T = 64;
const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
const AROUND: ViewShape = { reach: 8 * T, halfAngle: Math.PI, near: 2 * T };
const AHEAD: ViewShape = { reach: 8 * T, halfAngle: Math.PI / 3, near: 2 * T };

describe('how far and how wide you see', () => {
  it('sees clearly close up and fades out over the last stretch of the reach', () => {
    expect(distanceFalloff(0)).toBe(1);
    expect(distanceFalloff(FADE_FROM)).toBe(1);
    expect(distanceFalloff(1)).toBe(0);
    expect(distanceFalloff(2)).toBe(0);
    for (let u = 0; u < 1; u += 0.05) expect(distanceFalloff(u + 0.05)).toBeLessThanOrEqual(distanceFalloff(u));
    expect(edgeFalloff(0)).toBe(1);
    expect(edgeFalloff(1)).toBeCloseTo(0.5);
    expect(edgeFalloff(EDGE[1])).toBe(0);
  });

  it('all around: the same every way you look, nothing past the reach', () => {
    for (const a of [0, 1, 2, 3, 4, 5]) {
      expect(viewLevel(Math.cos(a) * 5 * T, Math.sin(a) * 5 * T, 0, AROUND)).toBe(1);
      expect(viewLevel(Math.cos(a) * 9 * T, Math.sin(a) * 9 * T, 0, AROUND)).toBe(0);
    }
    expect(viewReach(AROUND)).toBe(8 * T);
  });

  it('narrower: far the way you face, close by all around, nothing far behind', () => {
    expect(viewLevel(6 * T, 0, 0, AHEAD)).toBe(1);
    expect(viewLevel(-6 * T, 0, 0, AHEAD)).toBe(0);
    expect(viewLevel(0, 6 * T, 0, AHEAD)).toBe(0);
    // Your back, close by.
    expect(viewLevel(-T, 0, 0, AHEAD)).toBe(1);
    // Half seen at the edge of the view.
    const edge = AHEAD.halfAngle;
    expect(viewLevel(Math.cos(edge) * 4 * T, Math.sin(edge) * 4 * T, 0, AHEAD)).toBeCloseTo(0.5);
    // The view turns with you.
    expect(viewLevel(0, 6 * T, Math.PI / 2, AHEAD)).toBe(1);
    expect(viewReach({ ...AHEAD, near: 10 * T })).toBe(10 * T);
  });
});

describe('walls block the view', () => {
  // A wall one tile thick down column 4, a thicker one (3 tiles) down columns 8-10.
  const grid = Grid.fromRows(
    [
      '....#...###....', //
      '....#...###....',
      '....#...###....',
      '....#...###....',
    ],
    T,
  );

  it('goes on into the wall it stops at to show it, but never out the far side', () => {
    const from = at(1, 1);
    // The wall's near face is 4 * T - from.x away; its far side one tile further.
    const face = 4 * T - from.x;
    expect(sightRay(grid, from.x, from.y, 0, 20 * T, 0.8 * T)).toBeCloseTo(face + 0.8 * T);
    expect(sightRay(grid, from.x, from.y, 0, 20 * T, 3 * T)).toBeCloseTo(face + T);
    // Short of the wall it stops at its reach.
    expect(sightRay(grid, from.x, from.y, 0, face - 10, T)).toBe(face - 10);
    // A thick wall: only as deep as asked.
    const inner = at(6, 1);
    expect(sightRay(grid, inner.x, inner.y, 0, 20 * T, 0.8 * T)).toBeCloseTo(8 * T - inner.x + 0.8 * T);
    // From inside a wall, nothing.
    const inWall = at(4, 1);
    expect(sightRay(grid, inWall.x, inWall.y, 0, 20 * T, T)).toBe(0);
  });

  it('sees the wall but not the room behind it', () => {
    const from = at(1, 1);
    expect(inSight(grid, from, at(3, 1), 10 * T, T)).toBe(true);
    expect(inSight(grid, from, at(4, 1), 10 * T, T)).toBe(true);
    expect(inSight(grid, from, at(5, 1), 10 * T, T)).toBe(false);
    expect(inSight(grid, from, at(6, 2), 10 * T, T)).toBe(false);
    // Out of reach, even in the open.
    expect(inSight(grid, from, at(1, 3), T, T)).toBe(false);
  });

  it('sees a spot only in the view and in sight', () => {
    const from = at(1, 1);
    expect(seesSpot(grid, from, 0, AROUND, T, at(3, 2))).toBe(true);
    expect(seesSpot(grid, from, 0, AROUND, T, at(6, 1))).toBe(false);
    // Facing away, it's behind you and too far to see without turning.
    expect(seesSpot(grid, from, Math.PI, { ...AHEAD, near: T }, T, at(3, 2))).toBe(false);
    expect(seesSpot(grid, from, Math.PI, AHEAD, T, at(2, 1))).toBe(true);
    // Barely in the view counts as seen.
    expect(SEEN_LEVEL).toBeLessThan(1);
  });

  it('casts rays all round, sorted, with a pair at each wall corner in reach', () => {
    const open = Grid.fromRows(Array(9).fill('.........'), T);
    const free = viewRays(open, at(4, 4), 2 * T, T, 32);
    // The map's edge counts as wall, but it's out of reach here: just the spokes.
    expect(free.length).toBe(32);
    expect(free.every((r) => r.dist === 2 * T)).toBe(true);

    const rays = viewRays(grid, at(1, 1), 4 * T, 0.8 * T, 32);
    expect(rays.length).toBeGreaterThan(32);
    for (let i = 1; i < rays.length; i++) expect(rays[i].angle).toBeGreaterThanOrEqual(rays[i - 1].angle);
    expect(rays.every((r) => r.dist >= 0 && r.dist <= 4 * T)).toBe(true);
    // Rays just either side of the wall's top-left corner (4, 1): a hit short of it, a miss past it.
    const corner = Math.atan2(1 * T - at(1, 1).y, 4 * T - at(1, 1).x);
    const near = rays.filter((r) => Math.abs(r.angle - corner) < 1e-3);
    expect(near.length).toBe(2);
  });

  /** Whether (x, y) is inside one of the triangles. */
  function hidden(tris: number[][], p: { x: number; y: number }): boolean {
    const side = (ax: number, ay: number, bx: number, by: number) => (bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax);
    return tris.some(([ax, ay, bx, by, cx, cy]) => {
      const d1 = side(ax, ay, bx, by);
      const d2 = side(bx, by, cx, cy);
      const d3 = side(cx, cy, ax, ay);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    });
  }

  it('hides what is behind the walls and nothing in front of them', () => {
    const from = at(1, 1);
    const reach = 6 * T;
    const tris: number[][] = [];
    shadowTriangles(from, viewRays(grid, from, reach, 0.8 * T), reach, reach + T, (...xy) => tris.push(xy));
    expect(tris.length).toBeGreaterThan(0);
    expect(hidden(tris, at(6, 1))).toBe(true);
    expect(hidden(tris, at(5, 3))).toBe(true);
    expect(hidden(tris, at(3, 1))).toBe(false);
    expect(hidden(tris, at(0, 3))).toBe(false);
    // The wall's near face shows.
    expect(hidden(tris, { x: 4 * T + 8, y: from.y })).toBe(false);
  });

  it('hides nothing in the open', () => {
    const open = Grid.fromRows(Array(9).fill('.........'), T);
    const tris: number[][] = [];
    shadowTriangles(at(4, 4), viewRays(open, at(4, 4), 2 * T, T), 2 * T, 3 * T, (...xy) => tris.push(xy));
    expect(tris.length).toBe(0);
  });
});

describe('what you have seen', () => {
  const inside = (p: { x: number; y: number }, r: { x: number; y: number; width: number; height: number }) =>
    p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;

  it('looks for a thing on every tile it stands on and near its corners', () => {
    const tile = { x: 2 * T, y: 3 * T, width: T, height: T };
    const one = footprintSpots(tile, T);
    expect(one).toContainEqual(at(2, 3));
    expect(one.length).toBe(5);
    expect(one.every((p) => inside(p, tile))).toBe(true);
    const block = { x: 0, y: 0, width: 4 * T, height: 2 * T };
    const van = footprintSpots(block, T);
    expect(van.length).toBe(8 + 4);
    expect(van.every((p) => inside(p, block))).toBe(true);
  });

  // Two rooms, a wall down column 5 between them with a doorway at row 2.
  const rows = [
    '.....#.....', //
    '.....#.....',
    '...........',
    '.....#.....',
    '.....#.....',
  ];
  const grid = Grid.fromRows(rows, T);
  const cols = rows[0].length;
  const tile = (x: number, y: number) => y * cols + x;

  it('explores the room you are in, its walls, and what you see through the doorway', () => {
    const explored = new Uint8Array(cols * rows.length);
    const eye = at(2, 2);
    const found = exploreFrom(grid, eye, 0, AROUND, T, explored, cols, rows.length);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((i) => explored[i] === 1)).toBe(true);
    // Your own room and the wall across it.
    for (const [x, y] of [
      [0, 0],
      [4, 0],
      [1, 4],
      [4, 4],
      [5, 0],
      [5, 4],
    ]) {
      expect(explored[tile(x, y)]).toBe(1);
    }
    // Through the doorway, straight across: seen. Behind the wall: not.
    expect(explored[tile(6, 2)]).toBe(1);
    expect(explored[tile(8, 2)]).toBe(1);
    expect(explored[tile(10, 0)]).toBe(0);
    expect(explored[tile(7, 4)]).toBe(0);
    expect(explored[tile(10, 4)]).toBe(0);
    // Nothing new from the same spot.
    expect(exploreFrom(grid, eye, 0, AROUND, T, explored, cols, rows.length)).toEqual([]);
    // Step into the doorway: the far room opens up.
    const more = exploreFrom(grid, at(5, 2), 0, AROUND, T, explored, cols, rows.length);
    expect(more).toContain(tile(10, 0));
    expect(more).toContain(tile(10, 4));
    expect(more).not.toContain(tile(8, 2));
  });

  it('explores only as far as you see', () => {
    const explored = new Uint8Array(cols * rows.length);
    exploreFrom(grid, at(1, 4), 0, { reach: 2 * T, halfAngle: Math.PI, near: 0 }, T, explored, cols, rows.length);
    expect(explored[tile(1, 3)]).toBe(1);
    expect(explored[tile(1, 0)]).toBe(0);
  });
});

describe('how places out of sight look', () => {
  it('turns everything light gray: black goes pale, white stays white', () => {
    const m = memoryMatrix(1, 0.45);
    const black = applyMatrix(m, [0, 0, 0]);
    expect(black[0]).toBe(black[1]);
    expect(black[0]).toBeGreaterThan(100);
    expect(black[0]).toBeLessThan(130);
    // A cool hint of blue.
    expect(black[2]).toBeGreaterThan(black[0]);
    const white = applyMatrix(m, [255, 255, 255]);
    expect(white).toEqual([255, 255, 255]);
    // Colours of the same brightness come out the same gray.
    const red = applyMatrix(m, [200, 40, 40]);
    expect(red[0]).toBe(red[1]);
    // Alpha passes through untouched.
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it('keeps colours and brightness when told to', () => {
    const m = memoryMatrix(0, 0);
    expect(applyMatrix(m, [200, 40, 90])).toEqual([200, 40, 90]);
    const pale = applyMatrix(memoryMatrix(0, 0.5), [200, 40, 90]);
    expect(pale[0]).toBeGreaterThan(pale[1]);
    expect(pale[1]).toBeGreaterThan(40);
  });
});

describe('the shipped fog of war', () => {
  const F = BALANCE.fog;
  it('is on and lets you see further than anyone sees you on a normal day', () => {
    expect(F.mode).toBe('on');
    const gravy = BALANCE.boss.visionRangeBaseTiles + BALANCE.boss.visionRangeTilesPerAwareness * 2;
    expect(F.viewTiles * FADE_FROM).toBeGreaterThan(gravy);
    expect(F.viewTiles * FADE_FROM).toBeGreaterThan(BALANCE.students.visionRangeTiles);
  });

  it('sees all around you, hides people out of sight, and greys out the rest', () => {
    expect(F.viewAngleDeg).toBe(360);
    // Nobody out of sight, not even a vision cone round a corner.
    expect(F.people).toBe('hidden');
    expect(F.gray).toBeGreaterThan(0.5);
    expect(F.light).toBeGreaterThan(0);
    expect(F.light).toBeLessThan(1);
    expect(F.unexploredHaze).toBeGreaterThan(0);
    expect(F.unexploredHaze).toBeLessThan(1);
  });
});
