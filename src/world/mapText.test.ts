import { describe, expect, it } from 'vitest';
import { parseMap, serializeMap } from './mapText';
import { validateMap } from './validate';

const SMALL = `
// a tiny test school
@ 2,2 Test Room
BBBBBBBBBB
B,,,,.f..B
B,,d,....B
B,,,,....B
B###.##LLB
B.1....2.B
B..G..S..B
B........B
B.P..VV..B
B....VV..B
BBBBBBBBBB
`;

describe('map text format', () => {
  const map = parseMap(SMALL);

  it('reads size, starts and objects', () => {
    expect([map.width, map.height]).toEqual([10, 11]);
    expect(map.player).toEqual({ x: 2, y: 8 });
    expect(map.boss).toEqual({ x: 3, y: 6 });
    expect(map.students).toEqual([{ x: 6, y: 6 }]);
    expect(map.fixtures.map((f) => f.id).sort()).toEqual(['desk', 'drinking_fountain']);
    expect(map.patrol).toEqual([
      { x: 2, y: 5 },
      { x: 7, y: 5 },
    ]);
  });

  it('groups the van and doors into rectangles', () => {
    expect(map.van).toEqual({ x: 5, y: 8, w: 2, h: 2 });
    expect(map.doors).toEqual([{ x: 7, y: 4, w: 2, h: 1 }]);
  });

  it('puts the neighbouring floor under objects', () => {
    // The desk at 3,2 sits on classroom carpet (tile 1); the fountain at 6,1 on hallway (tile 0).
    expect(map.floor[2][3]).toBe(1);
    expect(map.floor[1][6]).toBe(0);
  });

  it('names rooms, honouring "@ x,y Name"', () => {
    const names = map.rooms.map((r) => r.name);
    expect(names).toContain('Test Room');
    expect(names).toContain('Hallway');
  });

  it('is playable', () => {
    expect(validateMap(map).errors).toEqual([]);
  });

  it('round-trips', () => {
    const again = parseMap(serializeMap(map.rows, map.names));
    expect(again.rows).toEqual(map.rows);
    expect(again.names).toEqual(map.names);
  });

  it('reports problems instead of crashing', () => {
    const bad = parseMap('BBBB\nB?.B\nBBB\n');
    expect(bad.problems.some((p) => p.includes('Unknown character "?"'))).toBe(true);
    expect(bad.problems.some((p) => p.includes('Row 2'))).toBe(true);
    const report = validateMap(bad);
    expect(report.errors.some((e) => e.includes('No player start'))).toBe(true);
  });

  it('names route stops by their digit, even with gaps', () => {
    const gappy = parseMap(SMALL.replace('B.1....2.B', 'B.1....5.B').replace('B........B', 'B######3#B'));
    expect(gappy.patrolStops).toEqual([1, 3, 5]);
    const report = validateMap(gappy);
    expect(report.errors.some((e) => e.startsWith('Route stop 3 at'))).toBe(true);
    expect(report.errors.some((e) => e.includes('stop 2'))).toBe(false);
  });

  it('finds unreachable loot', () => {
    const walled = parseMap(SMALL.replace('B,,,,.f..B', 'B,,,,#f..B').replace('B,,d,....B', 'B,,d,#...B').replace('B,,,,....B', 'B,,,,#...B').replace('B###.##LLB', 'B######LLB'));
    const report = validateMap(walled);
    expect(report.errors.some((e) => e.includes("Desk at 3,2 can't be reached"))).toBe(true);
  });
});
