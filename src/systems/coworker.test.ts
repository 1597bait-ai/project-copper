import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { COWORKER_LINES } from '../config/npcs';
import { besideDesk, coworkerLine, coworkerWakes, shuffleTarget } from './coworker';
import { Grid } from './Grid';

describe('sleepy coworker: when he turns up', () => {
  it('uses the chance roll', () => {
    expect(coworkerWakes(0.25, 0, 1, 0.1)).toBe(true);
    expect(coworkerWakes(0.25, 0, 1, 0.3)).toBe(false);
    expect(coworkerWakes(1, 0, 1, 0.999)).toBe(true);
    expect(coworkerWakes(0, 0, 1, 0)).toBe(false);
  });

  it('turns up at most maxPerShift times', () => {
    expect(coworkerWakes(1, 1, 1, 0)).toBe(false);
    expect(coworkerWakes(1, 1, 2, 0)).toBe(true);
  });

  it('is tuned as asked: a 1 in 4 chance, once a shift, $50', () => {
    expect(BALANCE.sleepyCoworker.chance).toBe(0.25);
    expect(BALANCE.sleepyCoworker.maxPerShift).toBe(1);
    expect(BALANCE.sleepyCoworker.hushMoney).toBe(50);
    expect(BALANCE.sleepyCoworker.napsUnder).toContain('desk');
  });
});

// # = wall, D = the desk (solid), . = floor.
const rows = [
  '#######',
  '#.....#',
  '#..D..#',
  '#.....#',
  '#######',
];
const grid = Grid.fromRows(
  rows.map((r) => r.replace('D', '#')),
  64,
);
const desk = { x: 3, y: 2 };

describe('sleepy coworker: where he crawls out', () => {
  it('prefers the tile in front of the desk', () => {
    expect(besideDesk(grid, desk, null)).toEqual({ x: 3, y: 3 });
  });

  it("avoids Dalton's tile", () => {
    expect(besideDesk(grid, desk, { x: 3, y: 3 })).toEqual({ x: 2, y: 2 });
  });

  it('keeps out from right under (or over) Dalton when there is another way out', () => {
    // A desk in a corner: wall below and to the right, Dalton scrapping from the left.
    const corner = Grid.fromRows(['#####', '#...#', '#..##', '#####'], 64);
    const at = { x: 3, y: 2 };
    // Not below Dalton (2,3 is a wall here anyway) nor at 2,1 straight above him: the diagonal 3,1.
    expect(besideDesk(corner, at, { x: 2, y: 2 })).toEqual({ x: 3, y: 1 });
    // With a free tile diagonal to Dalton, that one.
    const open = Grid.fromRows(['####', '#..#', '#..#', '####'], 64);
    expect(besideDesk(open, { x: 2, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 2, y: 2 });
    // When the only other tile is right below Dalton: better there than on top of him.
    const tight = Grid.fromRows(['####', '#.##', '#.##', '####'], 64);
    expect(besideDesk(tight, { x: 2, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 2 });
  });

  it('uses whatever is open next to a desk against a wall', () => {
    const tight = Grid.fromRows(['#####', '#.#.#', '#####'], 64);
    expect(besideDesk(tight, { x: 2, y: 1 }, null)).toEqual({ x: 1, y: 1 });
    // Only Dalton's tile is free: better there than nowhere.
    expect(besideDesk(Grid.fromRows(['###', '#.#', '###'], 64), { x: 1, y: 0 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
    expect(besideDesk(Grid.fromRows(['###', '###'], 64), { x: 1, y: 0 }, null)).toBeNull();
  });
});

describe('sleepy coworker: shuffling off', () => {
  it('heads for the open tile farthest from Dalton within reach', () => {
    expect(shuffleTarget(grid, { x: 3, y: 3 }, { x: 1, y: 1 }, 5)).toEqual({ x: 5, y: 3 });
  });

  it("doesn't walk through walls or past his radius", () => {
    const hall = Grid.fromRows(['##########', '#........#', '##########'], 64);
    expect(shuffleTarget(hall, { x: 2, y: 1 }, { x: 1, y: 1 }, 3)).toEqual({ x: 5, y: 1 });
  });

  it('stays put when boxed in', () => {
    const box = Grid.fromRows(['###', '#.#', '###'], 64);
    expect(shuffleTarget(box, { x: 1, y: 1 }, { x: 0, y: 0 }, 4)).toEqual({ x: 1, y: 1 });
  });
});

describe('sleepy coworker: what he says', () => {
  it('fills in the money', () => {
    expect(coworkerLine("Here's {money}.", 50)).toBe("Here's $50.");
    expect(coworkerLine('{money}!', 12.5)).toBe('$12.50!');
    expect(coworkerLine(COWORKER_LINES.bribe, 50)).toContain('$50');
  });
});
