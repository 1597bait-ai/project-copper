import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { Grid } from './Grid';
import {
  BEAM_EDGE,
  GLOW_FULL,
  beamFalloff,
  glowFalloff,
  indoorShare,
  lightLevel,
  lightRay,
  lightRays,
  lightReach,
  reaches,
  shadowTriangles,
  type LightShape,
} from './lighting';

const T = 64;
const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * T, y: (ty + 0.5) * T });
const SHAPE: LightShape = { glow: 3 * T, beam: 7 * T, beamHalfAngle: (30 * Math.PI) / 180 };

describe('the light you carry', () => {
  it('glows fully bright in the middle and fades out to nothing at its rim', () => {
    expect(glowFalloff(0)).toBe(1);
    expect(glowFalloff(GLOW_FULL)).toBe(1);
    expect(glowFalloff(1)).toBe(0);
    expect(glowFalloff(2)).toBe(0);
    for (let u = 0; u < 1; u += 0.05) expect(glowFalloff(u + 0.05)).toBeLessThanOrEqual(glowFalloff(u));
  });

  it('shines its beam ahead, half bright at its half-width, dark past its edge', () => {
    expect(beamFalloff(0.2, 0)).toBe(1);
    expect(beamFalloff(0.2, 1)).toBeCloseTo(0.5);
    expect(beamFalloff(0.2, BEAM_EDGE[1])).toBe(0);
    expect(beamFalloff(1, 0)).toBe(0);
  });

  it('lights what the glow or the beam reaches, and nothing behind you past the glow', () => {
    const ahead = lightLevel(5 * T, 0, 0, SHAPE);
    expect(ahead).toBeGreaterThan(0.2);
    expect(lightLevel(-5 * T, 0, 0, SHAPE)).toBe(0);
    expect(lightLevel(0, 5 * T, 0, SHAPE)).toBe(0);
    // Close by, all round.
    for (const a of [0, 1, 2, 3, 4, 5]) expect(lightLevel(Math.cos(a) * T, Math.sin(a) * T, 0, SHAPE)).toBe(1);
    // The beam turns with you.
    expect(lightLevel(0, 5 * T, Math.PI / 2, SHAPE)).toBeCloseTo(ahead);
    expect(lightReach(SHAPE)).toBe(7 * T);
    expect(lightReach({ ...SHAPE, beam: 0 })).toBe(3 * T);
  });

  it('turned off, lights nothing', () => {
    expect(lightLevel(10, 10, 0, { glow: 0, beam: 0, beamHalfAngle: 0.5 })).toBe(0);
    expect(lightLevel(T, 0, 0, { glow: 0, beam: 7 * T, beamHalfAngle: 0 })).toBe(0);
  });
});

describe('walls cast shadows', () => {
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

  it('goes on into the wall it stops at to show its face, but never out the far side', () => {
    const from = at(1, 1);
    // The wall's near face is 4 * T - from.x away; its far side one tile further.
    const face = 4 * T - from.x;
    expect(lightRay(grid, from.x, from.y, 0, 20 * T, 0.8 * T)).toBeCloseTo(face + 0.8 * T);
    expect(lightRay(grid, from.x, from.y, 0, 20 * T, 3 * T)).toBeCloseTo(face + T);
    // Short of the wall it stops at its reach.
    expect(lightRay(grid, from.x, from.y, 0, face - 10, T)).toBe(face - 10);
    // A thick wall: only as deep as asked.
    const inner = at(6, 1);
    expect(lightRay(grid, inner.x, inner.y, 0, 20 * T, 0.8 * T)).toBeCloseTo(8 * T - inner.x + 0.8 * T);
    // From inside a wall, nothing.
    const inWall = at(4, 1);
    expect(lightRay(grid, inWall.x, inWall.y, 0, 20 * T, T)).toBe(0);
  });

  it('reaches the near face of a wall but not the room behind it', () => {
    const from = at(1, 1);
    expect(reaches(grid, from, at(3, 1), 10 * T, 0.8 * T)).toBe(true);
    expect(reaches(grid, from, { x: 4 * T + 10, y: from.y }, 10 * T, 0.8 * T)).toBe(true);
    expect(reaches(grid, from, at(5, 1), 10 * T, 0.8 * T)).toBe(false);
    expect(reaches(grid, from, at(6, 2), 10 * T, 0.8 * T)).toBe(false);
    // Out of reach, even in the open.
    expect(reaches(grid, from, at(1, 3), T, 0.8 * T)).toBe(false);
  });

  it('casts rays all round, sorted, with a pair at each wall corner in reach', () => {
    const open = Grid.fromRows(Array(9).fill('.........'), T);
    const free = lightRays(open, at(4, 4), 2 * T, T, 32);
    // The map's edge counts as wall, but it's out of reach here: just the spokes.
    expect(free.length).toBe(32);
    expect(free.every((r) => r.dist === 2 * T)).toBe(true);

    const rays = lightRays(grid, at(1, 1), 4 * T, 0.8 * T, 32);
    expect(rays.length).toBeGreaterThan(32);
    for (let i = 1; i < rays.length; i++) expect(rays[i].angle).toBeGreaterThanOrEqual(rays[i - 1].angle);
    expect(rays.every((r) => r.dist >= 0 && r.dist <= 4 * T)).toBe(true);
    // Rays just either side of the wall's top-left corner (4, 1): a hit short of it, a miss past it.
    const corner = Math.atan2(1 * T - at(1, 1).y, 4 * T - at(1, 1).x);
    const near = rays.filter((r) => Math.abs(r.angle - corner) < 1e-3);
    expect(near.length).toBe(2);
  });

  /** Whether (x, y) is inside one of the triangles. */
  function shaded(tris: number[][], p: { x: number; y: number }): boolean {
    const side = (ax: number, ay: number, bx: number, by: number) => (bx - ax) * (p.y - ay) - (by - ay) * (p.x - ax);
    return tris.some(([ax, ay, bx, by, cx, cy]) => {
      const d1 = side(ax, ay, bx, by);
      const d2 = side(bx, by, cx, cy);
      const d3 = side(cx, cy, ax, ay);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    });
  }

  it('shades what is behind the walls and nothing in front of them', () => {
    const from = at(1, 1);
    const reach = 6 * T;
    const tris: number[][] = [];
    shadowTriangles(from, lightRays(grid, from, reach, 0.8 * T), reach, reach + T, (...xy) => tris.push(xy));
    expect(tris.length).toBeGreaterThan(0);
    expect(shaded(tris, at(6, 1))).toBe(true);
    expect(shaded(tris, at(5, 3))).toBe(true);
    expect(shaded(tris, at(3, 1))).toBe(false);
    expect(shaded(tris, at(0, 3))).toBe(false);
    // The wall's near face is lit.
    expect(shaded(tris, { x: 4 * T + 8, y: from.y })).toBe(false);
  });

  it('casts no shadow in the open', () => {
    const open = Grid.fromRows(Array(9).fill('.........'), T);
    const tris: number[][] = [];
    shadowTriangles(at(4, 4), lightRays(open, at(4, 4), 2 * T, T), 2 * T, 3 * T, (...xy) => tris.push(xy));
    expect(tris.length).toBe(0);
  });
});

describe('the dark before any light', () => {
  // o = outside floor, i = inside floor, # = wall.
  const shade = (rows: string[], perTile = 2) =>
    indoorShare(
      {
        width: rows[0].length,
        height: rows.length,
        wall: (x, y) => rows[y][x] === '#',
        outside: (x, y) => rows[y][x] === 'o',
      },
      perTile,
    );

  it('is dark inside and light outside', () => {
    const s = shade(['oo', 'ii'], 1);
    expect([...s]).toEqual([0, 0, 1, 1]);
  });

  it("splits the building's outer wall: lit on its outer half, dark on its inner half", () => {
    // Inside above, the outer wall, outside below.
    const s = shade(['iii', '###', 'ooo']);
    const row = (y: number) => [...s.slice(y * 6, y * 6 + 6)];
    // The wall's two rows of spots (rows 2 and 3 of 6).
    expect(row(2)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(row(3)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(row(0)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(row(5)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('keeps inner walls dark, and lets a tie go indoors (daylight never leaks in)', () => {
    expect([...shade(['i#i'], 1)]).toEqual([1, 1, 1]);
    // A wall spot exactly as close to the inside as to the outside.
    expect([...shade(['o#i'], 1)]).toEqual([0, 1, 1]);
  });

  it('gives a wall buried in other walls the nearest floor', () => {
    const s = shade(['o###i', 'o###i'], 1);
    expect([...s.slice(0, 5)]).toEqual([0, 0, 1, 1, 1]);
  });
});

describe('the shipped lighting', () => {
  const L = BALANCE.lighting;
  it("lets your beam see further than anyone's cone reaches you on a normal day", () => {
    const gravy = BALANCE.boss.visionRangeBaseTiles + BALANCE.boss.visionRangeTilesPerAwareness * 2;
    expect(L.beamTiles).toBeGreaterThan(gravy);
    expect(L.beamTiles).toBeGreaterThan(BALANCE.students.visionRangeTiles);
  });

  it('is on, dark but not pitch black, with daylight outside', () => {
    expect(L.darkness).toBeGreaterThan(0.5);
    expect(L.darkness).toBeLessThan(1);
    expect(L.daylight).toBe(1);
    expect(L.shadows).toBe('walls');
  });
});
