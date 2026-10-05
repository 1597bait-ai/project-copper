// Checks that a map is playable. Used by the unit tests (every shipped map), the game
// (refuses to start a broken map) and the map editor (shows problems while you draw).

import { TILE } from '../config/balance';
import { FIXTURES } from '../config/fixtures';
import { Grid } from '../systems/Grid';
import { findPath } from '../systems/pathfinding';
import type { ParsedMap, TilePoint } from './mapText';

export interface MapReport {
  /** The map can't be played until these are fixed. */
  errors: string[];
  /** Playable, but probably not what you meant. */
  warnings: string[];
}

/** Walls only. */
export function wallGrid(map: ParsedMap): Grid {
  const grid = new Grid(map.width, map.height, TILE);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) grid.set(x, y, map.walls[y][x] >= 0);
  return grid;
}

/** Where people can walk: walls, solid fixtures and the van block; doors count as open unless asked. */
export function walkGrid(map: ParsedMap, doorsLocked = false): Grid {
  const grid = wallGrid(map);
  for (const f of map.fixtures) if (FIXTURES[f.id]?.solid) grid.set(f.x, f.y, true);
  const fill = (r: { x: number; y: number; w: number; h: number }) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid.set(x, y, true);
  };
  if (map.van) fill(map.van);
  if (doorsLocked) map.doors.forEach(fill);
  return grid;
}

export function validateMap(map: ParsedMap): MapReport {
  const errors: string[] = [...map.problems];
  const warnings: string[] = [];
  if (map.width < 8 || map.height < 8) errors.push('The map is too small (at least 8x8)');
  if (!map.player) errors.push('No player start — place a P');
  if (!map.boss) errors.push('No Mr. Gravy start — place a G');
  if (!map.van) errors.push('No van — place a 2x4 or 4x2 block of V');
  if (map.patrol.length < 2) errors.push("Mr. Gravy's route needs at least 2 stops (1, 2, ...)");
  if (map.fixtures.length === 0) warnings.push('Nothing to scrap yet — add some fixtures');
  if (!map.player) return { errors, warnings };

  const grid = walkGrid(map);
  const from = map.player;
  if (grid.blocked(from.x, from.y)) errors.push(`The player start at ${from.x},${from.y} is inside something solid`);

  // Flood fill from the player start once, then everything else is a lookup.
  const reach = new Uint8Array(map.width * map.height);
  const stack: TilePoint[] = [from];
  reach[from.y * map.width + from.x] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (grid.blocked(nx, ny) || reach[ny * map.width + nx]) continue;
      reach[ny * map.width + nx] = 1;
      stack.push({ x: nx, y: ny });
    }
  }
  const reachable = (x: number, y: number) => grid.inBounds(x, y) && reach[y * map.width + x] === 1;
  /** Solid things are used from a tile next to them. */
  const usable = (x: number, y: number) =>
    reachable(x, y) || reachable(x + 1, y) || reachable(x - 1, y) || reachable(x, y + 1) || reachable(x, y - 1);

  for (const f of map.fixtures) {
    if (!FIXTURES[f.id]) errors.push(`Unknown fixture "${f.id}" at ${f.x},${f.y}`);
    else if (!usable(f.x, f.y)) errors.push(`${FIXTURES[f.id].name} at ${f.x},${f.y} can't be reached from the player start`);
  }
  if (map.van) {
    const v = map.van;
    let ok = false;
    for (let y = v.y - 1; y <= v.y + v.h && !ok; y++) for (let x = v.x - 1; x <= v.x + v.w && !ok; x++) ok = reachable(x, y);
    if (!ok) errors.push("The van can't be reached from the player start");
  }
  if (map.boss && !reachable(map.boss.x, map.boss.y)) errors.push(`Mr. Gravy's start at ${map.boss.x},${map.boss.y} is walled off or blocked`);
  map.patrol.forEach((p, i) => {
    if (!reachable(p.x, p.y)) errors.push(`Route stop ${i + 1} at ${p.x},${p.y} is walled off or blocked`);
  });
  for (const s of map.students) if (!reachable(s.x, s.y)) errors.push(`Student at ${s.x},${s.y} is walled off or blocked`);
  for (const d of map.doors) {
    let ok = false;
    for (let y = d.y - 1; y <= d.y + d.h && !ok; y++) for (let x = d.x - 1; x <= d.x + d.w && !ok; x++) ok = reachable(x, y);
    if (!ok) warnings.push(`The locked door at ${d.x},${d.y} can't be reached`);
  }
  // Pathfinding sanity: A* agrees with the flood fill for the route (diagonal rules differ slightly).
  for (let i = 1; i < map.patrol.length; i++) {
    const a = map.patrol[i - 1];
    const b = map.patrol[i];
    if (reachable(a.x, a.y) && reachable(b.x, b.y) && !findPath(grid, a.x, a.y, b.x, b.y)) {
      errors.push(`Mr. Gravy can't walk from stop ${i} to stop ${i + 1}`);
    }
  }
  return { errors, warnings };
}
