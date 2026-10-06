// The rules behind the in-game map editor (src/scenes/EditorScene.ts). A map is edited as its
// grid rows (see src/world/mapText.ts for the text format); nothing here touches Phaser, so
// every rule is unit tested in editing.test.ts.

import { FIXTURES } from '../config/fixtures';
import { FIXTURE_CHARS, OBJECT_BY_CHAR, isFloorChar, isWallChar, tileByChar } from './legend';
import { parseMap, serializeMap, type ParsedMap, type TilePoint } from './mapText';

/** Tool "characters" that aren't map characters (map characters are always one letter). */
export const ROUTE_STOP = 'route';
export const ERASER = 'erase';
/** The van tool stamps a whole van; a single V cell is never painted on its own. */
export const VAN = 'V';

/** The van is VAN_W x VAN_H tiles, or VAN_H x VAN_W when turned. */
export const VAN_W = 4;
export const VAN_H = 2;

const STOPS = '123456789';

export interface PaintOptions {
  /** Stamp the van 2 wide and 4 tall instead of 4 wide and 2 tall. */
  vanRotated?: boolean;
}

export interface PaintResult {
  rows: string[];
  changed: boolean;
  /** Something worth telling the user ("Route stop 3", "All 9 route stops are used"...). */
  message?: string;
}

/** Floors, walls and the eraser are painted continuously while dragging; things are placed once per tap. */
export function isDragTool(ch: string): boolean {
  return ch === ERASER || isFloorChar(ch) || isWallChar(ch);
}

const isObject = (ch: string) => ch in OBJECT_BY_CHAR;

/**
 * The floor drawn under the cell at x,y. Same rule as parseMap: a floor cell is itself; anything
 * else stands on the nearest plain floor, searching outward up to 4 tiles, else hallway floor.
 */
export function floorUnder(rows: readonly string[], x: number, y: number): string {
  const at = (cx: number, cy: number) => (cy < 0 || cy >= rows.length || cx < 0 || cx >= rows[cy].length ? '#' : rows[cy][cx]);
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
}

/** The most common floor touching (edge to edge) any cell of `ch`, or null when none does. */
function floorAround(rows: readonly string[], ch: string): string | null {
  const counts = new Map<string, number>();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== ch) continue;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const n = rows[ny]?.[nx];
        if (n !== undefined && isFloorChar(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
  });
  let best: string | null = null;
  for (const [floor, n] of counts) if (best === null || n > counts.get(best)!) best = floor;
  return best;
}

/** The lowest route stop (1-9) not on the map yet, or null when all nine are placed. */
export function nextRouteStop(rows: readonly string[]): number | null {
  const used = new Set<string>();
  for (const row of rows) for (const ch of row) if (STOPS.includes(ch)) used.add(ch);
  for (const d of STOPS) if (!used.has(d)) return Number(d);
  return null;
}

/** Where a van stamped at x,y lands: around the tapped tile, pushed inside the map. Null if it can't fit. */
export function vanRect(rows: readonly string[], x: number, y: number, rotated = false): { x: number; y: number; w: number; h: number } | null {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const w = rotated ? VAN_H : VAN_W;
  const h = rotated ? VAN_W : VAN_H;
  if (w > width || h > height) return null;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  return { x: clamp(x - Math.floor((w - 1) / 2), width - w), y: clamp(y - Math.floor((h - 1) / 2), height - h), w, h };
}

/**
 * Applies one tool to the tile at x,y and returns the new rows (the input is never modified).
 *
 * - Floors and walls replace the tile. So do things, except:
 * - P, G and route digits are unique: placing one removes the old one.
 * - ROUTE_STOP places the lowest unused stop 1-9 (nothing happens when all nine are used).
 * - VAN removes the old van and stamps a new 4x2 (or 2x4) block of V around x,y.
 * - ERASER removes a thing (leaving the floor that was under it) or turns a floor/wall into hallway.
 *   A removed van leaves the floor most common around it.
 * - Touching any cell of the van with another tool removes the whole van, so it never ends up broken.
 * - Outside the map nothing happens.
 */
export function paint(rows: readonly string[], x: number, y: number, ch: string, opts: PaintOptions = {}): PaintResult {
  const unchanged: PaintResult = { rows: [...rows], changed: false };
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return unchanged;
  const grid = rows.map((r) => r.split(''));
  const current = rows[y][x];
  let message: string | undefined;

  // Things that are removed leave behind the floor they were drawn on (judged before this edit).
  // A van is big, so it leaves the floor most common around it (a parking space, not stray lines).
  const clear = (cx: number, cy: number) => (grid[cy][cx] = floorUnder(rows, cx, cy));
  const removeAll = (target: string) => {
    const around = target === VAN ? floorAround(rows, VAN) : null;
    rows.forEach((row, cy) => {
      for (let cx = 0; cx < row.length; cx++) if (row[cx] === target) grid[cy][cx] = around ?? floorUnder(rows, cx, cy);
    });
  };
  const put = (value: string) => {
    if (current === VAN && value !== VAN) removeAll(VAN);
    grid[y][x] = value;
  };

  if (ch === VAN) {
    const r = vanRect(rows, x, y, opts.vanRotated);
    if (!r) return { ...unchanged, message: 'The map is too small for the van' };
    removeAll(VAN);
    for (let cy = r.y; cy < r.y + r.h; cy++) for (let cx = r.x; cx < r.x + r.w; cx++) grid[cy][cx] = VAN;
  } else if (ch === ROUTE_STOP) {
    if (STOPS.includes(current)) return { ...unchanged, message: `Route stop ${current} is already here` };
    const next = nextRouteStop(rows);
    if (next === null) return { ...unchanged, message: 'All 9 route stops are used. Erase one first.' };
    put(String(next));
    message = `Route stop ${next}`;
  } else if (ch === ERASER) {
    if (current === VAN) removeAll(VAN);
    else if (isObject(current)) clear(x, y);
    else grid[y][x] = '.';
  } else if (ch === 'P' || ch === 'G' || (ch.length === 1 && STOPS.includes(ch))) {
    if (current !== ch) removeAll(ch);
    put(ch);
  } else if (ch.length === 1 && (isFloorChar(ch) || isWallChar(ch) || isObject(ch))) {
    put(ch);
  } else {
    return unchanged;
  }

  const next = grid.map((r) => r.join(''));
  const changed = next.some((r, i) => r !== rows[i]);
  return { rows: next, changed, message: changed ? message : undefined };
}

/**
 * The tiles on a straight line from a to b (both included), each sharing an edge with the one
 * before it, so a fast drag paints a solid wall with no diagonal gaps.
 */
export function lineCells(x0: number, y0: number, x1: number, y1: number): TilePoint[] {
  const nx = Math.abs(x1 - x0);
  const ny = Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  const out: TilePoint[] = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    // Step along whichever axis keeps the path closest to the ideal line.
    if ((0.5 + ix) / nx < (0.5 + iy) / ny) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    out.push({ x, y });
  }
  return out;
}

/** Undo / redo of whole-map snapshots. One user action (a tap, a whole drag stroke) = one step. */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(readonly limit = 100) {}

  /** Call with the state from before an action. Clears the redo list. */
  record(before: T): void {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Returns the state to go back to, or undefined when there is nothing to undo. */
  undo(current: T): T | undefined {
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

type RoomNames = ParsedMap['names'];

export interface NameFix {
  names: RoomNames;
  changed: boolean;
  /** Names whose room is gone (walled over, or the tile was never in a room). */
  dropped: RoomNames;
}

/**
 * Keeps "@ x,y Name" lines on their rooms after the grid changes from `before` to `after`.
 * A name stays put while its tile is still in a room of the same kind. Otherwise it moves to the
 * nearest tile of its old room that still is (so walling over or erasing the anchor tile doesn't
 * rename the room). If the whole room changed kind the name goes with it; if the room is gone
 * the name is dropped.
 */
export function reconcileNames(before: readonly string[], after: readonly string[], names: RoomNames): NameFix {
  if (!names.length) return { names, changed: false, dropped: [] };
  const a = parseMap(before.join('\n'));
  const b = before === after ? a : parseMap(after.join('\n'));
  const roomOf = (m: ParsedMap, x: number, y: number) => (x >= 0 && y >= 0 && x < m.width && y < m.height ? m.roomAt[y * m.width + x] : -1);
  const kindOf = (m: ParsedMap, x: number, y: number) => m.rooms[roomOf(m, x, y)]?.kind ?? null;
  const out: RoomNames = [];
  const dropped: RoomNames = [];
  for (const n of names) {
    const was = roomOf(a, n.x, n.y);
    const kind = a.rooms[was]?.kind ?? null;
    const now = kindOf(b, n.x, n.y);
    if (kind === null || now === kind) {
      if (now === null) dropped.push(n);
      else out.push(n);
      continue;
    }
    let best: TilePoint | null = null;
    let bestD = Infinity;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        if (a.roomAt[y * a.width + x] !== was || kindOf(b, x, y) !== kind) continue;
        const d = (x - n.x) ** 2 + (y - n.y) ** 2;
        if (d < bestD) [best, bestD] = [{ x, y }, d];
      }
    }
    if (best) out.push({ ...best, name: n.name });
    else if (now !== null) out.push(n);
    else dropped.push(n);
  }
  const changed = out.length !== names.length || out.some((n, i) => n.x !== names[i].x || n.y !== names[i].y);
  return { names: changed ? out : names, changed, dropped };
}

/** Plain-English name for a map character ("Desk", "Classroom carpet", "Route stop 3"). */
export function cellName(ch: string): string {
  const fixture = FIXTURE_CHARS[ch];
  if (fixture) return FIXTURES[fixture]?.name ?? fixture;
  const obj = OBJECT_BY_CHAR[ch];
  if (obj?.kind === 'van') return 'Van';
  if (obj?.kind === 'patrol') return `Route stop ${ch}`;
  if (obj) return obj.name;
  return tileByChar(ch)?.name ?? ch;
}

/** "x,y — what's there — room name", for talking about positions ("@ x,y Name" lines). */
export function describeCell(map: ParsedMap, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return '';
  const room = map.rooms[map.roomAt[y * map.width + x]]?.name;
  return [`${x},${y}`, cellName(map.rows[y][x]), room].filter(Boolean).join(' — ');
}

/** Where the editor keeps the map being worked on. */
export const EDITOR_MAP_KEY = 'project-copper/editor/map/v1';
/** The built-in map that working copy started from, so an update to the built-in map can be noticed. */
export const EDITOR_BASE_KEY = 'project-copper/editor/base/v1';

/** Same grid and room names, whatever the comments and formatting. */
export function sameMap(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseMap(a);
  const pb = parseMap(b);
  return serializeMap(pa.rows, pa.names) === serializeMap(pb.rows, pb.names);
}

export interface EditorStart {
  /** The map to edit. */
  text: string;
  /** The built-in map it started from (saved alongside it). */
  base: string;
  /** The saved copy has edits and the built-in map has changed since the copy was started. */
  builtInChanged: boolean;
}

/**
 * The map the editor opens: the saved working copy, or `builtIn` when there is none, storage is
 * unavailable, or the copy is an unedited copy of an older built-in map.
 */
export function loadEditorMap(builtIn: string): EditorStart {
  let text: string | null = null;
  let base: string | null = null;
  try {
    text = globalThis.localStorage?.getItem(EDITOR_MAP_KEY) ?? null;
    base = globalThis.localStorage?.getItem(EDITOR_BASE_KEY) ?? null;
  } catch {
    // Storage can be blocked (private mode, sandboxed embeds): just start from the built-in map.
  }
  const fresh = { text: builtIn, base: builtIn, builtInChanged: false };
  if (!text?.trim()) return fresh;
  // Copies saved before the base was recorded are taken as based on today's map.
  if (!base || sameMap(base, builtIn)) return { text, base: builtIn, builtInChanged: false };
  if (sameMap(text, base)) return fresh;
  return { text, base, builtInChanged: true };
}

/** Returns false when the map couldn't be saved. */
export function saveEditorMap(text: string, base: string): boolean {
  try {
    globalThis.localStorage.setItem(EDITOR_MAP_KEY, text);
    globalThis.localStorage.setItem(EDITOR_BASE_KEY, base);
    return true;
  } catch {
    return false;
  }
}
