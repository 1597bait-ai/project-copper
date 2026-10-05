import type { Grid } from './Grid';
import { castRay } from './vision';

export interface Point {
  x: number;
  y: number;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/**
 * A* over the tile grid with 8-way movement (no cutting corners past walls).
 * Returns tile coordinates from start to goal inclusive, or null if unreachable.
 * If the goal tile is blocked, the nearest open neighbour is used instead.
 */
export function findPath(grid: Grid, sx: number, sy: number, gx: number, gy: number): Point[] | null {
  if (grid.blocked(gx, gy)) {
    const alt = nearestOpen(grid, gx, gy);
    if (!alt) return null;
    [gx, gy] = [alt.x, alt.y];
  }
  if (grid.blocked(sx, sy)) {
    const alt = nearestOpen(grid, sx, sy);
    if (!alt) return null;
    [sx, sy] = [alt.x, alt.y];
  }

  const w = grid.width;
  const size = w * grid.height;
  const g = new Float64Array(size).fill(Infinity);
  const f = new Float64Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open: number[] = [];

  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const start = sy * w + sx;
  const goal = gy * w + gx;
  g[start] = 0;
  f[start] = h(sx, sy);
  open.push(start);

  while (open.length) {
    // Maps are small (a few thousand tiles), so a linear scan beats a heap here.
    let best = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i;
    const cur = open[best];
    open[best] = open[open.length - 1];
    open.pop();

    if (cur === goal) {
      const path: Point[] = [];
      for (let n = cur; n !== -1; n = came[n]) path.push({ x: n % w, y: Math.floor(n / w) });
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.blocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (grid.blocked(cx + dx, cy) || grid.blocked(cx, cy + dy))) continue;
      const n = ny * w + nx;
      if (closed[n]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[n]) {
        g[n] = tentative;
        f[n] = tentative + h(nx, ny);
        came[n] = cur;
        open.push(n);
      }
    }
  }
  return null;
}

export function nearestOpen(grid: Grid, tx: number, ty: number, maxRadius = 4): Point | null {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!grid.blocked(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
      }
    }
  }
  return null;
}

/**
 * Turns a tile path into world waypoints, dropping corners that can be cut in a straight line.
 * `clearance` is the walker's radius: lines are checked along both edges of its body.
 */
export function smoothPath(grid: Grid, tiles: Point[], clearance: number): Point[] {
  const pts = tiles.map((t) => grid.center(t.x, t.y));
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!clearLine(grid, pts[anchor], pts[i], clearance)) {
      out.push(pts[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function clearLine(grid: Grid, a: Point, b: Point, clearance: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const angle = Math.atan2(dy, dx);
  const nx = (-dy / len) * clearance;
  const ny = (dx / len) * clearance;
  for (const s of [-1, 0, 1]) {
    if (castRay(grid, a.x + nx * s, a.y + ny * s, angle, len) < len) return false;
  }
  return true;
}
