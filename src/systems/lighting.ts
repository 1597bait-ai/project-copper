// Dynamic lighting: the dark school and the light you carry. Pure (no Phaser), so it's unit
// tested; src/world/Lighting.ts draws it.
//
// Your light is a glow all around you plus a flashlight beam the way you face. Walls and closed
// doors (the grid that blocks sight) cast shadows, but the light still shows the face of the wall
// it stops at. Before any light, each spot of the map is dark inside the school and in daylight
// outside (indoorShare).

import type { Grid } from './Grid';
import type { Point } from './pathfinding';
import { angleDiff } from './vision';

/** A light's size (world px) and the width of its beam. */
export interface LightShape {
  /** Radius of the glow all around. */
  glow: number;
  /** How far the beam reaches; 0 for no beam. */
  beam: number;
  /** Half the beam's width (radians), where it is half bright. */
  beamHalfAngle: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0 up to e0, 1 from e1, eased in between. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** The share of its radius the glow stays fully bright before fading out. */
export const GLOW_FULL = 0.4;
/** The share of its reach the beam stays fully bright. */
export const BEAM_FULL = 0.55;
/** The beam's edge fades out between these shares of its half-angle (half bright at 1). */
export const BEAM_EDGE: readonly [number, number] = [0.75, 1.25];

/** The glow at `u` = distance / radius: 1 in the middle, 0 at the rim and beyond. */
export function glowFalloff(u: number): number {
  return 1 - smoothstep(GLOW_FULL, 1, u);
}

/** The beam at `u` = distance / reach and `v` = angle off its middle / half-angle. */
export function beamFalloff(u: number, v: number): number {
  return (1 - smoothstep(BEAM_FULL, 1, u)) * (1 - smoothstep(BEAM_EDGE[0], BEAM_EDGE[1], v));
}

/** The farthest the light reaches (px). */
export function lightReach(shape: LightShape): number {
  return Math.max(shape.glow, shape.beamHalfAngle > 0 ? shape.beam : 0);
}

/**
 * How brightly the light lights a spot (dx, dy) px away from it, its beam aimed at `aim` (radians),
 * walls aside: 0-1.
 */
export function lightLevel(dx: number, dy: number, aim: number, shape: LightShape): number {
  const d = Math.hypot(dx, dy);
  const glow = shape.glow > 0 ? glowFalloff(d / shape.glow) : 0;
  const off = d === 0 ? 0 : Math.abs(angleDiff(aim, Math.atan2(dy, dx)));
  const beam = shape.beam > 0 && shape.beamHalfAngle > 0 ? beamFalloff(d / shape.beam, off / shape.beamHalfAngle) : 0;
  // Drawn into one light map, they light what either one does (a little more where both do).
  return glow + beam - glow * beam;
}

/**
 * How far the light from (x0, y0) gets along `angle` (radians): to the first wall or closed door,
 * and on into it by up to `wallDepth` px so the face it shows is lit, but never out the far side;
 * at most `reach`. 0 from inside a wall.
 */
export function lightRay(grid: Grid, x0: number, y0: number, angle: number, reach: number, wallDepth: number): number {
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
  // Where it went into a wall (-1: not yet).
  let hit = -1;
  for (;;) {
    // The distance at which the ray enters the next cell.
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
    if (hit < 0) {
      if (dist >= reach) return reach;
      if (grid.blocked(tx, ty)) hit = dist;
    } else if (dist >= hit + wallDepth || !grid.blocked(tx, ty)) {
      return Math.min(reach, dist, hit + wallDepth);
    }
  }
}

/** Whether the light at `origin` gets to spot `p`, past the walls (see lightRay). */
export function reaches(grid: Grid, origin: Point, p: Point, reach: number, wallDepth: number): boolean {
  const d = Math.hypot(p.x - origin.x, p.y - origin.y);
  if (d > reach) return false;
  return lightRay(grid, origin.x, origin.y, Math.atan2(p.y - origin.y, p.x - origin.x), reach, wallDepth) >= d - 1e-6;
}

export interface LightRay {
  angle: number;
  /** How far the light gets (see lightRay). */
  dist: number;
}

/** The angle between the pair of extra rays at a wall corner (one just past it, one just short). */
const CORNER_SPREAD = 1e-4;

const wrapAngle = (a: number) => (a < -Math.PI ? a + 2 * Math.PI : a >= Math.PI ? a - 2 * Math.PI : a);

/**
 * The outline of what the light at `origin` reaches: rays all around it, sorted by angle from -π,
 * `spokes` evenly spaced plus a pair at every wall corner within reach, so shadows start exactly at
 * the corners. See lightRay for `reach` and `wallDepth`.
 */
export function lightRays(grid: Grid, origin: Point, reach: number, wallDepth: number, spokes = 96): LightRay[] {
  const size = grid.tileSize;
  const angles: number[] = [];
  for (let i = 0; i < spokes; i++) angles.push(-Math.PI + (2 * Math.PI * i) / spokes);

  const cx = Math.floor(origin.x / size);
  const cy = Math.floor(origin.y / size);
  const r = Math.ceil(reach / size) + 1;
  const near = (reach + size) ** 2;
  const open = (x: number, y: number) => !grid.blocked(x, y);
  const seen = new Set<number>();
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = cx - r; tx <= cx + r; tx++) {
      if (open(tx, ty)) continue;
      for (let c = 0; c < 4; c++) {
        // The corner's grid point (x, y): cells (x-1, y-1), (x, y-1), (x-1, y) and (x, y) meet there.
        const x = tx + (c & 1);
        const y = ty + (c >> 1);
        const key = (y - cy + 512) * 1024 + (x - cx + 512);
        if (seen.has(key)) continue;
        seen.add(key);
        // Only corners with floor on some side: not ones buried in a thick wall.
        if (!(open(x - 1, y - 1) || open(x, y - 1) || open(x - 1, y) || open(x, y))) continue;
        const px = x * size - origin.x;
        const py = y * size - origin.y;
        if (px * px + py * py > near) continue;
        const a = Math.atan2(py, px);
        angles.push(wrapAngle(a - CORNER_SPREAD), wrapAngle(a + CORNER_SPREAD));
      }
    }
  }
  angles.sort((a, b) => a - b);
  return angles.map((angle) => ({ angle, dist: lightRay(grid, origin.x, origin.y, angle, reach, wallDepth) }));
}

/**
 * The shadows behind the walls, as triangles (x0, y0, x1, y1, x2, y2 each) for `push`: between each
 * pair of neighbouring rays, from where the light stops out to `far` px from the origin. A pair that
 * reaches its full `reach` both times casts none (nothing beyond that is lit anyway).
 */
export function shadowTriangles(origin: Point, rays: readonly LightRay[], reach: number, far: number, push: (...xy: number[]) => void): void {
  const n = rays.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const a = rays[i];
    const b = rays[(i + 1) % n];
    if (a.dist >= reach && b.dist >= reach) continue;
    const ca = Math.cos(a.angle);
    const sa = Math.sin(a.angle);
    const cb = Math.cos(b.angle);
    const sb = Math.sin(b.angle);
    const ax = origin.x + ca * a.dist;
    const ay = origin.y + sa * a.dist;
    const bx = origin.x + cb * b.dist;
    const by = origin.y + sb * b.dist;
    const fax = origin.x + ca * far;
    const fay = origin.y + sa * far;
    const fbx = origin.x + cb * far;
    const fby = origin.y + sb * far;
    push(ax, ay, bx, by, fbx, fby);
    push(ax, ay, fbx, fby, fax, fay);
  }
}

// ---- the dark before any light --------------------------------------------------------

/** What indoorShare needs to know about a map. */
export interface ShadeMap {
  width: number;
  height: number;
  wall(x: number, y: number): boolean;
  /** Whether the floor here is outdoors (daylight). */
  outside(x: number, y: number): boolean;
}

/**
 * How indoors each spot of the map is: 1 inside the school, 0 out in the open. `perTile` spots
 * across and down every tile, row by row (`width * perTile` to a row). A floor is inside or out by
 * its room. A wall takes after the floor nearest each spot, so the building's outer wall is outdoors
 * on its outer half and indoors on its inner half; a tie goes indoors, so daylight never leaks in.
 */
export function indoorShare(map: ShadeMap, perTile = 2): Float32Array {
  const { width, height } = map;
  const floorValue = (x: number, y: number) => (map.outside(x, y) ? 0 : 1);
  const deep = wallValues(map);
  const rowLength = width * perTile;
  const out = new Float32Array(rowLength * height * perTile);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const isWall = map.wall(tx, ty);
      for (let sy = 0; sy < perTile; sy++) {
        for (let sx = 0; sx < perTile; sx++) {
          let v = isWall ? -1 : floorValue(tx, ty);
          if (isWall) {
            // Where the spot sits in its tile (0-1), and the nearest floor tile around it.
            const fx = (sx + 0.5) / perTile;
            const fy = (sy + 0.5) / perTile;
            let best = Infinity;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = tx + dx;
                const ny = ty + dy;
                if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= width || ny >= height || map.wall(nx, ny)) continue;
                const d = (dx + 0.5 - fx) ** 2 + (dy + 0.5 - fy) ** 2;
                const nv = floorValue(nx, ny);
                if (d < best - 1e-9) [best, v] = [d, nv];
                else if (d < best + 1e-9) v = Math.max(v, nv);
              }
            }
            if (v < 0) v = deep[ty * width + tx];
          }
          out[(ty * perTile + sy) * rowLength + tx * perTile + sx] = v;
        }
      }
    }
  }
  return out;
}

/** For every wall tile, the value (1 inside, 0 outside) of the floor fewest steps away through walls (inside wins ties). */
function wallValues(map: ShadeMap): Float32Array {
  const { width, height } = map;
  const value = new Float32Array(width * height).fill(-1);
  let frontier: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map.wall(x, y)) continue;
      value[y * width + x] = map.outside(x, y) ? 0 : 1;
      frontier.push(y * width + x);
    }
  }
  while (frontier.length) {
    const next: number[] = [];
    const reached = new Map<number, number>();
    for (const i of frontier) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (value[j] >= 0) continue;
        if (!reached.has(j)) next.push(j);
        reached.set(j, Math.max(reached.get(j) ?? 0, value[i]));
      }
    }
    for (const [j, v] of reached) value[j] = v;
    frontier = next;
  }
  // A map that is all wall: call it indoors.
  for (let i = 0; i < value.length; i++) if (value[i] < 0) value[i] = 1;
  return value;
}
