import { afterEach, describe, expect, it } from 'vitest';
import {
  EDITOR_BASE_KEY,
  EDITOR_MAP_KEY,
  ERASER,
  EditHistory,
  ROUTE_STOP,
  VAN,
  describeCell,
  floorUnder,
  isDragTool,
  lineCells,
  loadEditorMap,
  nextRouteStop,
  paint,
  reconcileNames,
  sameMap,
  saveEditorMap,
} from './editing';
import { TILE_INDEX } from './legend';
import { parseMap, serializeMap } from './mapText';
import { DEFAULT_MAP } from './maps';
import { validateMap } from './validate';

// prettier-ignore
const SMALL = [
  'BBBBBBBBBB',
  'B,,,,.f..B',
  'B,,d,....B',
  'B,,,,....B',
  'B###.##LLB',
  'B.1....2.B',
  'B..G..S..B',
  'B........B',
  'B.P..VV..B',
  'B....VV..B',
  'BBBBBBBBBB',
];

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;
const cellsOf = (rows: string[], ch: string) => rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [{ x, y }] : [])));

describe('floorUnder', () => {
  it('matches the floor parseMap draws under every tile of the shipped map', () => {
    const map = parseMap(DEFAULT_MAP.text);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.walls[y][x] >= 0) continue;
        expect(TILE_INDEX[floorUnder(map.rows, x, y)], `${x},${y}`).toBe(map.floor[y][x]);
      }
    }
  });
});

describe('paint', () => {
  it('replaces floors and walls and never touches the input', () => {
    const before = [...SMALL];
    const r = paint(SMALL, 4, 3, '#');
    expect(r.changed).toBe(true);
    expect(r.rows[3]).toBe('B,,,#....B');
    expect(SMALL).toEqual(before);
  });

  it('reports no change when the tile already matches', () => {
    expect(paint(SMALL, 0, 0, 'B').changed).toBe(false);
  });

  it('does nothing outside the map', () => {
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [10, 0],
      [0, 11],
    ]) {
      const r = paint(SMALL, x, y, '#');
      expect(r.changed).toBe(false);
      expect(r.rows).toEqual(SMALL);
    }
    expect(paint(SMALL, 99, 99, VAN).changed).toBe(false);
  });

  it('keeps one player start and one Mr. Gravy', () => {
    const p = paint(SMALL, 7, 7, 'P').rows;
    expect(cellsOf(p, 'P')).toEqual([{ x: 7, y: 7 }]);
    expect(p[8][2]).toBe('.'); // the old start leaves its floor behind
    const g = paint(p, 1, 7, 'G').rows;
    expect(cellsOf(g, 'G')).toEqual([{ x: 1, y: 7 }]);
    expect(cellsOf(g, 'P')).toEqual([{ x: 7, y: 7 }]);
  });

  it('places the lowest unused route stop, and says so when all nine are used', () => {
    let rows = paint(SMALL, 4, 7, ROUTE_STOP).rows;
    expect(rows[7][4]).toBe('3');
    rows = paint(rows, 2, 5, ERASER).rows; // erase stop 1: the others stay put
    expect(rows[5]).toBe('B......2.B');
    expect(rows[7][4]).toBe('3');
    const r = paint(rows, 5, 7, ROUTE_STOP);
    expect(r.rows[7][5]).toBe('1'); // gaps are filled first
    expect(r.message).toBe('Route stop 1');
    rows = r.rows;
    for (let x = 1; x <= 6; x++) rows = paint(rows, x, 3, ROUTE_STOP).rows; // stops 4-9
    expect(nextRouteStop(rows)).toBeNull();
    const full = paint(rows, 8, 7, ROUTE_STOP);
    expect(full.changed).toBe(false);
    expect(full.rows).toEqual(rows);
    expect(full.message).toMatch(/All 9/);
  });

  it('does not stack a new stop on an existing one', () => {
    const r = paint(SMALL, 2, 5, ROUTE_STOP);
    expect(r.changed).toBe(false);
    expect(r.rows[5][2]).toBe('1');
  });

  it('keeps route digits unique when one is placed directly', () => {
    const rows = paint(SMALL, 4, 7, '2').rows;
    expect(cellsOf(rows, '2')).toEqual([{ x: 4, y: 7 }]);
  });

  it('stamps a 4x2 van after removing the old one', () => {
    const r = paint(SMALL, 3, 6, VAN);
    expect(r.changed).toBe(true);
    expect(count(r.rows, 'V')).toBe(8);
    expect(r.rows[8]).toBe('B.P......B'); // old van gone, its floor left behind
    const map = parseMap(r.rows.join('\n'));
    expect(map.van).toEqual({ x: 2, y: 6, w: 4, h: 2 });
    expect(map.boss).toBeNull(); // the van landed on Mr. Gravy
  });

  it('stamps a 2x4 van when turned, pushed inside the map edge', () => {
    const r = paint(SMALL, 8, 9, VAN, { vanRotated: true });
    expect(parseMap(r.rows.join('\n')).van).toEqual({ x: 8, y: 7, w: 2, h: 4 });
    expect(count(r.rows, 'V')).toBe(8);
  });

  it('removes the whole van when any of its tiles is painted or erased', () => {
    const erased = paint(SMALL, 6, 9, ERASER);
    expect(count(erased.rows, 'V')).toBe(0);
    expect(erased.rows[9]).toBe('B........B');
    const walled = paint(SMALL, 5, 8, '#');
    expect(count(walled.rows, 'V')).toBe(0);
    expect(walled.rows[8][5]).toBe('#');
  });

  it('fills a removed van with the floor around it, not stray parking lines', () => {
    const lot = ['|pppp|', '|VVVV|', '|VVVV|', '|pppp|'];
    expect(paint(lot, 2, 1, ERASER).rows).toEqual(['|pppp|', '|pppp|', '|pppp|', '|pppp|']);
    const moved = paint([...lot, '|pppp|', '|pppp|'], 2, 4, VAN).rows;
    expect(moved).toEqual(['|pppp|', '|pppp|', '|pppp|', '|pppp|', '|VVVV|', '|VVVV|']);
  });

  it('erases things down to their floor and floors/walls to hallway', () => {
    expect(paint(SMALL, 3, 2, ERASER).rows[2]).toBe('B,,,,....B'); // desk -> carpet
    expect(paint(SMALL, 2, 2, ERASER).rows[2]).toBe('B,.d,....B'); // carpet -> hallway
    expect(paint(SMALL, 3, 4, ERASER).rows[4]).toBe('B##..##LLB'); // wall -> hallway
  });

  it('places things once on a tile', () => {
    const r = paint(SMALL, 7, 7, 'c');
    expect(r.rows[7][7]).toBe('c');
    expect(parseMap(r.rows.join('\n')).fixtures).toContainEqual({ id: 'abandoned_copper_pile', x: 7, y: 7 });
  });

  it('ignores tools it does not know', () => {
    expect(paint(SMALL, 4, 3, '?').changed).toBe(false);
    expect(paint(SMALL, 4, 3, 'pan').changed).toBe(false);
  });

  it('keeps the shipped map playable through a typical edit', () => {
    let rows = parseMap(DEFAULT_MAP.text).rows;
    rows = paint(rows, 20, 11, 'c').rows;
    rows = paint(rows, 10, 45, VAN).rows;
    const map = parseMap(serializeMap(rows));
    expect(validateMap(map).errors).toEqual([]);
    expect(map.van).toEqual({ x: 9, y: 45, w: 4, h: 2 });
  });
});

describe('isDragTool', () => {
  it('drags floors, walls and the eraser; taps everything else', () => {
    expect(['.', ',', '#', 'B', 'F', ERASER].every(isDragTool)).toBe(true);
    expect(['P', 'G', 'S', 'L', 'c', VAN, ROUTE_STOP, '3'].some(isDragTool)).toBe(false);
  });
});

describe('lineCells', () => {
  const edgeConnected = (cells: { x: number; y: number }[]) =>
    cells.every((c, i) => i === 0 || Math.abs(c.x - cells[i - 1].x) + Math.abs(c.y - cells[i - 1].y) === 1);

  it('includes both ends', () => {
    expect(lineCells(3, 4, 3, 4)).toEqual([{ x: 3, y: 4 }]);
    const l = lineCells(0, 0, 5, 0);
    expect(l).toHaveLength(6);
    expect(l.at(-1)).toEqual({ x: 5, y: 0 });
  });

  it('leaves no gaps, even diagonally and backwards', () => {
    for (const [x0, y0, x1, y1] of [
      [0, 0, 7, 3],
      [10, 10, 2, 1],
      [0, 0, 6, 6],
      [5, 0, 0, 9],
      [-3, 2, 4, -6],
    ]) {
      const cells = lineCells(x0, y0, x1, y1);
      expect(cells[0]).toEqual({ x: x0, y: y0 });
      expect(cells.at(-1)).toEqual({ x: x1, y: y1 });
      expect(cells).toHaveLength(Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1);
      expect(edgeConnected(cells)).toBe(true);
    }
  });

  it('stays close to the straight line', () => {
    for (const c of lineCells(0, 0, 12, 4)) expect(Math.abs(c.y - c.x / 3)).toBeLessThanOrEqual(1);
  });
});

describe('EditHistory', () => {
  it('undoes and redoes, and a new action clears redo', () => {
    const h = new EditHistory<number>();
    expect(h.canUndo).toBe(false);
    expect(h.undo(0)).toBeUndefined();
    h.record(0);
    h.record(1);
    expect(h.undo(2)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.undo(0)).toBeUndefined();
    expect(h.redo(0)).toBe(1);
    expect(h.redo(1)).toBe(2);
    expect(h.redo(2)).toBeUndefined();
    h.undo(2);
    h.record(1);
    expect(h.canRedo).toBe(false);
  });

  it('keeps at least the last 50 steps', () => {
    const h = new EditHistory<number>();
    for (let i = 0; i < 200; i++) h.record(i);
    let steps = 0;
    let s = 200;
    for (let v = h.undo(s); v !== undefined; v = h.undo(s)) {
      s = v;
      steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(50);
    expect(s).toBe(200 - steps);
  });
});

describe('describeCell', () => {
  const map = parseMap(['@ 2,2 Test Room', ...SMALL].join('\n'));

  it('names the tile and its room', () => {
    expect(describeCell(map, 3, 2)).toBe('3,2 — Desk — Test Room');
    expect(describeCell(map, 2, 5)).toBe('2,5 — Route stop 1 — Hallway');
    expect(describeCell(map, 0, 0)).toBe('0,0 — Brick wall');
    expect(describeCell(map, 5, 8)).toBe('5,8 — Van — Hallway');
    expect(describeCell(map, 7, 4)).toBe('7,4 — Locked door');
  });

  it('is empty off the map', () => {
    expect(describeCell(map, -1, 0)).toBe('');
    expect(describeCell(map, 10, 0)).toBe('');
  });
});

describe('reconcileNames', () => {
  const names = [{ x: 2, y: 2, name: 'Test Room' }];
  const roomNamed = (rows: string[], n: typeof names, name: string) => {
    const map = parseMap(serializeMap(rows, n));
    return map.rooms.filter((r) => r.name === name).map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h }));
  };
  const classroom = { kind: 'classroom', x: 1, y: 1, w: 4, h: 3 };

  it('leaves names alone when their room is untouched', () => {
    const r = reconcileNames(SMALL, paint(SMALL, 7, 7, '#').rows, names);
    expect(r).toEqual({ names, changed: false, dropped: [] });
    expect(r.names).toBe(names);
  });

  it('moves a name off a tile that was walled over, keeping it on its room', () => {
    const after = paint(SMALL, 2, 2, '#').rows;
    const r = reconcileNames(SMALL, after, names);
    expect(r.changed).toBe(true);
    expect(r.names).toEqual([{ x: 2, y: 1, name: 'Test Room' }]);
    expect(validateMap(parseMap(serializeMap(after, r.names))).errors).toEqual([]);
    expect(roomNamed(after, r.names, 'Test Room')).toEqual([classroom]);
  });

  it('does not rename the room when its anchor tile is erased to hallway', () => {
    const after = paint(SMALL, 2, 2, ERASER).rows;
    expect(after[2][2]).toBe('.');
    const r = reconcileNames(SMALL, after, names);
    expect(r.names).toEqual([{ x: 2, y: 1, name: 'Test Room' }]);
    expect(roomNamed(after, r.names, 'Test Room')).toEqual([classroom]);
  });

  it('keeps the name when the whole room changes kind', () => {
    const after = SMALL.map((row, y) => (y >= 1 && y <= 3 ? row.slice(0, 1) + row.slice(1, 5).replace(/,/g, 'o') + row.slice(5) : row));
    const r = reconcileNames(SMALL, after, names);
    expect(r.changed).toBe(false);
    expect(roomNamed(after, r.names, 'Test Room')).toEqual([{ ...classroom, kind: 'office' }]);
  });

  it('drops a name whose room is gone', () => {
    const after = SMALL.map((row, y) => (y >= 1 && y <= 3 ? row.slice(0, 1) + '####' + row.slice(5) : row));
    const r = reconcileNames(SMALL, after, names);
    expect(r).toEqual({ names: [], changed: true, dropped: names });
  });

  it('drops names that never pointed at a room', () => {
    const bad = [...names, { x: 0, y: 0, name: 'On a wall' }, { x: 40, y: 3, name: 'Off the map' }];
    const r = reconcileNames(SMALL, SMALL, bad);
    expect(r.names).toEqual(names);
    expect(r.dropped.map((n) => n.name)).toEqual(['On a wall', 'Off the map']);
  });

  it('keeps every name on the shipped map valid when an anchor tile is painted over', () => {
    const map = parseMap(DEFAULT_MAP.text);
    for (const n of map.names) {
      for (const tool of ['#', ERASER, '.', 'L']) {
        const after = paint(map.rows, n.x, n.y, tool).rows;
        const r = reconcileNames(map.rows, after, map.names);
        const edited = parseMap(serializeMap(after, r.names));
        expect(edited.problems, `${tool} on ${n.name}`).toEqual([]);
        expect(edited.rooms.filter((room) => room.name === n.name), `${tool} on ${n.name}`).toHaveLength(1);
        expect(edited.rooms.find((room) => room.name === n.name)!.kind).toBe(map.rooms[map.roomAt[n.y * map.width + n.x]].kind);
      }
    }
  });
});

describe('editor storage', () => {
  const g = globalThis as { localStorage?: Storage };
  const original = g.localStorage;
  afterEach(() => {
    g.localStorage = original;
  });
  const OLD = serializeMap(SMALL);
  const NEW = serializeMap(paint(SMALL, 7, 7, 'c').rows);
  const EDITED = serializeMap(paint(SMALL, 1, 7, '#').rows);
  const memory = (seed: Record<string, string> = {}) => {
    const store = new Map(Object.entries(seed));
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    return store;
  };

  it('falls back to the built-in map when storage is missing or throws', () => {
    const fresh = { text: 'built-in', base: 'built-in', builtInChanged: false };
    g.localStorage = undefined;
    expect(loadEditorMap('built-in')).toEqual(fresh);
    expect(saveEditorMap('x', 'built-in')).toBe(false);
    g.localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadEditorMap('built-in')).toEqual(fresh);
    expect(saveEditorMap('x', 'built-in')).toBe(false);
  });

  it('saves the map with the built-in map it started from, and loads it back', () => {
    const store = memory();
    expect(loadEditorMap(OLD)).toEqual({ text: OLD, base: OLD, builtInChanged: false });
    expect(saveEditorMap(EDITED, OLD)).toBe(true);
    expect(store.get(EDITOR_MAP_KEY)).toBe(EDITED);
    expect(store.get(EDITOR_BASE_KEY)).toBe(OLD);
    expect(loadEditorMap(OLD)).toEqual({ text: EDITED, base: OLD, builtInChanged: false });
  });

  it('opens an updated built-in map instead of an unedited copy of the old one', () => {
    memory({ [EDITOR_MAP_KEY]: OLD, [EDITOR_BASE_KEY]: OLD });
    expect(loadEditorMap(NEW)).toEqual({ text: NEW, base: NEW, builtInChanged: false });
    // Comments and formatting don't count as edits.
    memory({ [EDITOR_MAP_KEY]: OLD, [EDITOR_BASE_KEY]: `// old notes\n${SMALL.join('\r\n')}` });
    expect(loadEditorMap(NEW).text).toBe(NEW);
  });

  it('keeps edited work when the built-in map changes, and says so', () => {
    memory({ [EDITOR_MAP_KEY]: EDITED, [EDITOR_BASE_KEY]: OLD });
    expect(loadEditorMap(NEW)).toEqual({ text: EDITED, base: OLD, builtInChanged: true });
  });

  it('keeps a copy saved before bases were recorded', () => {
    memory({ [EDITOR_MAP_KEY]: EDITED });
    expect(loadEditorMap(NEW)).toEqual({ text: EDITED, base: NEW, builtInChanged: false });
  });

  it('compares maps by grid and room names only', () => {
    expect(sameMap(OLD, `// a note\n\n${SMALL.join('\n')}\n`)).toBe(true);
    expect(sameMap(OLD, NEW)).toBe(false);
    expect(sameMap(OLD, serializeMap(SMALL, [{ x: 2, y: 2, name: 'Art Room' }]))).toBe(false);
  });
});
