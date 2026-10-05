import type { Grid } from './Grid';
import type { Point } from './pathfinding';

/**
 * Casts a ray through the grid (DDA) and returns the distance travelled before
 * entering a blocked tile, capped at maxDist.
 */
export function castRay(grid: Grid, x0: number, y0: number, angle: number, maxDist: number): number {
  const size = grid.tileSize;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let tx = Math.floor(x0 / size);
  let ty = Math.floor(y0 / size);
  if (grid.blocked(tx, ty)) return 0;

  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const deltaX = dirX === 0 ? Infinity : Math.abs(size / dirX);
  const deltaY = dirY === 0 ? Infinity : Math.abs(size / dirY);
  let sideX = dirX === 0 ? Infinity : (dirX > 0 ? (tx + 1) * size - x0 : x0 - tx * size) / Math.abs(dirX);
  let sideY = dirY === 0 ? Infinity : (dirY > 0 ? (ty + 1) * size - y0 : y0 - ty * size) / Math.abs(dirY);

  for (;;) {
    let dist: number;
    if (sideX < sideY) {
      dist = sideX;
      sideX += deltaX;
      tx += stepX;
    } else {
      dist = sideY;
      sideY += deltaY;
      ty += stepY;
    }
    if (dist >= maxDist) return maxDist;
    if (grid.blocked(tx, ty)) return dist;
  }
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface Cone {
  origin: Point;
  facing: number;
  range: number;
  halfAngle: number;
}

/** True if `target` is inside the vision cone and not hidden behind an opaque tile. */
export function inCone(grid: Grid, cone: Cone, target: Point): boolean {
  const dx = target.x - cone.origin.x;
  const dy = target.y - cone.origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > cone.range) return false;
  if (dist < 1) return true;
  const angle = Math.atan2(dy, dx);
  if (Math.abs(angleDiff(cone.facing, angle)) > cone.halfAngle) return false;
  return castRay(grid, cone.origin.x, cone.origin.y, angle, dist) >= dist;
}

/** Outline of the cone clipped against walls, for drawing. */
export function conePolygon(grid: Grid, cone: Cone, rays = 28): Point[] {
  const pts: Point[] = [{ ...cone.origin }];
  for (let i = 0; i <= rays; i++) {
    const a = cone.facing - cone.halfAngle + (2 * cone.halfAngle * i) / rays;
    const d = castRay(grid, cone.origin.x, cone.origin.y, a, cone.range);
    pts.push({ x: cone.origin.x + Math.cos(a) * d, y: cone.origin.y + Math.sin(a) * d });
  }
  return pts;
}
