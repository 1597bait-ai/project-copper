import type { Grid } from './Grid';
import type { Point } from './pathfinding';

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Every tile a wanderer may stroll to: open in `grid`, liked (`likes`), within `radius` tiles of
 * `home`, and connected to home without leaving liked tiles. Doors only ever unlock, so tiles that
 * are reachable now stay reachable. Home itself is included only if it is liked.
 */
export function wanderArea(grid: Grid, home: Point, radius: number, likes: (tx: number, ty: number) => boolean): Point[] {
  if (grid.blocked(home.x, home.y)) return [];
  const r2 = radius * radius;
  const seen = new Set<number>([home.y * grid.width + home.x]);
  const queue: Point[] = [home];
  const area: Point[] = likes(home.x, home.y) ? [{ ...home }] : [];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of STEPS) {
      const x = c.x + dx;
      const y = c.y + dy;
      const key = y * grid.width + x;
      if (seen.has(key)) continue;
      seen.add(key);
      if (grid.blocked(x, y) || (x - home.x) ** 2 + (y - home.y) ** 2 > r2 || !likes(x, y)) continue;
      area.push({ x, y });
      queue.push({ x, y });
    }
  }
  return area;
}

/**
 * Picks the next stroll destination from `area`. Prefers tiles at least `minDistance` tiles from
 * `from` so a walk actually goes somewhere; falls back to any tile when the area is tiny.
 */
export function pickWanderTarget(area: Point[], from: Point, rng: () => number, minDistance = 2): Point | null {
  if (!area.length) return null;
  const far = area.filter((t) => (t.x - from.x) ** 2 + (t.y - from.y) ** 2 >= minDistance * minDistance);
  const pool = far.length ? far : area;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
