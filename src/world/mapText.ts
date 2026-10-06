// Text map format. A map file is plain text, one character per 64px tile:
//
//   // comment lines start with two slashes
//   @ 12,5 Boiler Room        <- optional: names the room that contains tile x=12, y=5
//   FFFFFFFFFF...              <- the grid (every row the same width)
//
// See src/world/legend.ts for what each character means. Objects (fixtures, spawns, the van...)
// sit on the floor of whatever is next to them, so you never have to pick a floor for them.

import { DECOR } from '../config/decor';
import { DECOR_CHARS, FIXTURE_CHARS, OBJECT_BY_CHAR, OBJECTS, ROOM_NAMES, TILES, TILE_INDEX, isFloorChar, isWallChar, tileByChar, type RoomKind } from './legend';

export interface TilePoint {
  x: number;
  y: number;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParsedRoom extends TileRect {
  name: string;
  kind: RoomKind;
}

export interface ParsedMap {
  width: number;
  height: number;
  /** The grid as written (unknown characters replaced with hallway floor). */
  rows: string[];
  /** Tile index per cell, -1 = none. */
  floor: number[][];
  walls: number[][];
  player: TilePoint | null;
  boss: TilePoint | null;
  students: TilePoint[];
  van: TileRect | null;
  doors: TileRect[];
  fixtures: { id: string; x: number; y: number }[];
  /** Plants, trash cans, trees, cars (see src/config/decor.ts). Solid but see-through. */
  decor: ({ id: string } & TileRect)[];
  /** Mr. Gravy's route, in stop order. */
  patrol: TilePoint[];
  /** The digit written on each route stop (parallel to `patrol`; gaps like 1,2,5 are allowed). */
  patrolStops: number[];
  rooms: ParsedRoom[];
  /** Room index per cell (-1 for walls and doors). */
  roomAt: Int16Array;
  /** "@ x,y Name" lines. */
  names: { x: number; y: number; name: string }[];
  /** Problems found while reading (bad characters, ragged rows, duplicate starts...). */
  problems: string[];
}

const NAME_LINE = /^@\s*(\d+)\s*,\s*(\d+)\s+(.+)$/;

export function parseMap(text: string): ParsedMap {
  const problems: string[] = [];
  const names: ParsedMap['names'] = [];
  const raw: string[] = [];
  text
    // Windows editors may save a byte-order mark and CRLF line endings.
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')
    .forEach((line, i) => {
      const trimmed = line.trimEnd();
      if (!trimmed || trimmed.trimStart().startsWith('//')) return;
      if (trimmed.startsWith('@')) {
        const m = NAME_LINE.exec(trimmed);
        if (m) names.push({ x: Number(m[1]), y: Number(m[2]), name: m[3].trim() });
        else problems.push(`Line ${i + 1}: room names look like "@ 12,5 Boiler Room"`);
        return;
      }
      raw.push(trimmed);
    });

  const height = raw.length;
  const width = Math.max(0, ...raw.map((r) => r.length));
  const rows = raw.map((r, y) => {
    let row = '';
    for (let x = 0; x < width; x++) {
      const ch = r[x];
      if (ch === undefined) {
        if (x === r.length) problems.push(`Row ${y} is ${r.length} wide, the map is ${width} wide (padded with wall)`);
        row += '#';
      } else if (!isFloorChar(ch) && !isWallChar(ch) && !(ch in OBJECT_BY_CHAR)) {
        problems.push(`Unknown character "${ch}" at ${x},${y} (treated as hallway floor)`);
        row += '.';
      } else row += ch;
    }
    return row;
  });

  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? '#' : rows[y][x]);

  // The floor under an object is the nearest plain floor tile (searching outward).
  const floorUnder = (x: number, y: number): string => {
    const ch = at(x, y);
    if (isFloorChar(ch)) return ch;
    for (let r = 1; r <= 4; r++) {
      for (const [dx, dy] of [
        [-r, 0],
        [r, 0],
        [0, -r],
        [0, r],
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
      ]) {
        const n = at(x + dx, y + dy);
        if (isFloorChar(n)) return n;
      }
    }
    return '.';
  };

  const floor: number[][] = [];
  const walls: number[][] = [];
  for (let y = 0; y < height; y++) {
    const f: number[] = [];
    const w: number[] = [];
    for (let x = 0; x < width; x++) {
      const ch = at(x, y);
      if (isWallChar(ch)) {
        f.push(-1);
        w.push(TILE_INDEX[ch]);
      } else {
        f.push(TILE_INDEX[floorUnder(x, y)]);
        w.push(-1);
      }
    }
    floor.push(f);
    walls.push(w);
  }

  // Objects
  let player: TilePoint | null = null;
  let boss: TilePoint | null = null;
  const students: TilePoint[] = [];
  const fixtures: ParsedMap['fixtures'] = [];
  const decor: ParsedMap['decor'] = [];
  const stops = new Map<number, TilePoint>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const def = OBJECT_BY_CHAR[at(x, y)];
      if (!def) continue;
      switch (def.kind) {
        case 'player':
          if (player) problems.push(`More than one player start (P) — using the first, at ${player.x},${player.y}`);
          else player = { x, y };
          break;
        case 'boss':
          if (boss) problems.push(`More than one Mr. Gravy start (G) — using the first, at ${boss.x},${boss.y}`);
          else boss = { x, y };
          break;
        case 'student':
          students.push({ x, y });
          break;
        case 'fixture':
          fixtures.push({ id: FIXTURE_CHARS[def.char], x, y });
          break;
        case 'decor': {
          const id = DECOR_CHARS[def.char];
          if (DECOR[id].w === 1 && DECOR[id].h === 1) decor.push({ id, x, y, w: 1, h: 1 });
          break;
        }
        case 'patrol': {
          const n = Number(def.char);
          if (stops.has(n)) problems.push(`Route stop ${n} appears more than once`);
          else stops.set(n, { x, y });
          break;
        }
        default:
          break;
      }
    }
  }
  const ordered = [...stops.entries()].sort((a, b) => a[0] - b[0]);
  const patrol = ordered.map(([, p]) => p);
  const patrolStops = ordered.map(([n]) => n);

  // Van and doors: group touching cells into rectangles.
  const groups = (ch: string): (TileRect & { filled: boolean })[] => {
    const seen = new Set<number>();
    const out: (TileRect & { filled: boolean })[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (at(x, y) !== ch || seen.has(y * width + x)) continue;
        const cells: TilePoint[] = [];
        const stack = [{ x, y }];
        seen.add(y * width + x);
        while (stack.length) {
          const c = stack.pop()!;
          cells.push(c);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            if (at(nx, ny) === ch && !seen.has(ny * width + nx)) {
              seen.add(ny * width + nx);
              stack.push({ x: nx, y: ny });
            }
          }
        }
        const minX = Math.min(...cells.map((c) => c.x));
        const minY = Math.min(...cells.map((c) => c.y));
        const w = Math.max(...cells.map((c) => c.x)) - minX + 1;
        const h = Math.max(...cells.map((c) => c.y)) - minY + 1;
        const filled = cells.length === w * h;
        if (!filled) problems.push(`"${ch}" at ${minX},${minY} isn't a filled rectangle`);
        out.push({ x: minX, y: minY, w, h, filled });
      }
    }
    return out;
  };
  const vans = groups('V');
  if (vans.length > 1) problems.push(`More than one van — using the one at ${vans[0].x},${vans[0].y}`);
  const van = vans[0] ? { x: vans[0].x, y: vans[0].y, w: vans[0].w, h: vans[0].h } : null;
  if (van && Math.min(van.w, van.h) < 2) problems.push('The van needs at least a 2x2 block of V (2x4 or 4x2 looks right)');
  const doors = groups('L').map(({ x, y, w, h }) => ({ x, y, w, h }));
  // Big decorations (cars): each block of their character is cut into w x h pieces.
  for (const [ch, id] of Object.entries(DECOR_CHARS)) {
    const { w, h, name } = DECOR[id];
    if (w === 1 && h === 1) continue;
    for (const r of groups(ch)) {
      if (!r.filled) continue;
      if (r.w % w || r.h % h) {
        problems.push(`${name}s are ${w}x${h} blocks of "${ch}": the one at ${r.x},${r.y} is ${r.w}x${r.h}`);
        continue;
      }
      for (let y = r.y; y < r.y + r.h; y += h) for (let x = r.x; x < r.x + r.w; x += w) decor.push({ id, x, y, w, h });
    }
  }

  // Rooms: connected floor of the same kind. Walls and doors separate rooms.
  const roomAt = new Int16Array(width * height).fill(-1);
  const rooms: ParsedRoom[] = [];
  const kindAt = (x: number, y: number): RoomKind | null => {
    const ch = at(x, y);
    if (isWallChar(ch) || ch === 'L') return null;
    return tileByChar(floorUnder(x, y))?.room ?? 'hallway';
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const kind = kindAt(x, y);
      if (!kind || roomAt[y * width + x] !== -1) continue;
      const id = rooms.length;
      let [minX, minY, maxX, maxY] = [x, y, x, y];
      const stack = [{ x, y }];
      roomAt[y * width + x] = id;
      while (stack.length) {
        const c = stack.pop()!;
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || roomAt[ny * width + nx] !== -1) continue;
          if (kindAt(nx, ny) !== kind) continue;
          roomAt[ny * width + nx] = id;
          stack.push({ x: nx, y: ny });
        }
      }
      rooms.push({ name: '', kind, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }
  const counters: Partial<Record<RoomKind, number>> = {};
  for (const room of rooms) {
    const n = (counters[room.kind] = (counters[room.kind] ?? 0) + 1);
    room.name = ROOM_NAMES[room.kind](n);
  }
  for (const n of names) {
    const id = n.x < width && n.y < height ? roomAt[n.y * width + n.x] : -1;
    if (id >= 0) rooms[id].name = n.name;
    else problems.push(`"@ ${n.x},${n.y} ${n.name}" doesn't point at a room`);
  }

  return { width, height, rows, floor, walls, player, boss, students, van, doors, fixtures, decor, patrol, patrolStops, rooms, roomAt, names, problems };
}

/** The comment block written at the top of every saved map, generated from the legend. */
export function legendComment(): string {
  const lines = [
    '// Project Copper map. One character = one 64px tile. Every row must be the same width.',
    '// Lines starting with // are notes. "@ x,y Name" names the room containing tile x,y',
    '// (x counts columns from 0 on the left, y counts rows from 0 at the top).',
    '//',
    '// Floors and walls:',
    ...TILES.map((t) => `//   ${t.char}  ${t.name}`),
    '//',
    '// Things (they stand on the floor next to them):',
    ...OBJECTS.filter((o) => o.kind !== 'patrol').map((o) => `//   ${o.char}  ${o.name.replace(/_/g, ' ')}`),
    "//   1-9  Mr. Gravy's route, walked in order and looped",
  ];
  return lines.join('\n');
}

export function serializeMap(rows: string[], names: ParsedMap['names'] = []): string {
  return [legendComment(), '', ...names.map((n) => `@ ${n.x},${n.y} ${n.name}`), ...(names.length ? [''] : []), ...rows, ''].join('\n');
}
