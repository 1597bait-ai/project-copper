// Fog of war: what Dalton can see from where he stands, and what he has seen before. Pure (no
// Phaser), so it's unit tested; src/world/Fog.ts draws it.
//
// He sees all around him (or, tuned narrower, the way he faces plus a little all around) out to a
// set distance, but never through walls or closed doors (the grid that blocks sight). A ray of
// sight goes on a little way into the first wall it meets, so the walls themselves are seen.
// Everywhere he can't see right now shows in light gray as he last saw it, with nobody in it; the
// building's layout shows even where he has never been, but not what's in the rooms.

import type { Grid } from './Grid';
import type { Point } from './pathfinding';
import { angleDiff } from './vision';

/** How far and how wide Dalton sees (world px and radians). */
export interface ViewShape {
  /** How far he sees. */
  reach: number;
  /** Half the view's width: π (or more) sees all around. */
  halfAngle: number;
  /** With a narrower view, how far he still sees all around him (his back included). */
  near: number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 0 up to e0, 1 from e1, eased in between. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** The view fades out over the last 20% of its reach. */
export const FADE_FROM = 0.8;
/** A narrower view's sides fade out between these shares of its half-width (half seen at 1). */
export const EDGE: readonly [number, number] = [0.85, 1.15];
/** A spot counts as seen where it's at least this clear (and no wall is in the way). */
export const SEEN_LEVEL = 0.5;

/** How clearly a spot `u` = distance / reach away is seen: 1 close up, 0 at the reach and beyond. */
export function distanceFalloff(u: number): number {
  return 1 - smoothstep(FADE_FROM, 1, u);
}

/** How clearly a spot `v` = its angle off the way he faces / the half-width is seen (narrower views). */
export function edgeFalloff(v: number): number {
  return 1 - smoothstep(EDGE[0], EDGE[1], v);
}

export function seesAllAround(shape: ViewShape): boolean {
  return shape.halfAngle >= Math.PI;
}

/** The farthest he sees (px). */
export function viewReach(shape: ViewShape): number {
  return seesAllAround(shape) ? shape.reach : Math.max(shape.reach, shape.near);
}

/** How clearly he sees a spot (dx, dy) px away when facing `aim` (radians), walls aside: 0-1. */
export function viewLevel(dx: number, dy: number, aim: number, shape: ViewShape): number {
  const d = Math.hypot(dx, dy);
  const far = shape.reach > 0 ? distanceFalloff(d / shape.reach) : 0;
  if (seesAllAround(shape)) return far;
  const near = shape.near > 0 ? distanceFalloff(d / shape.near) : 0;
  const off = d === 0 ? 0 : Math.abs(angleDiff(aim, Math.atan2(dy, dx)));
  const ahead = shape.halfAngle > 0 ? far * edgeFalloff(off / shape.halfAngle) : 0;
  // Drawn into one texture, the two show what either one does (a little more where both do).
  return near + ahead - near * ahead;
}

/**
 * How far sight from (x0, y0) gets along `angle` (radians): to the first wall or closed door, and
 * on into it by up to `wallDepth` px so the wall is seen, but never out of its far side; at most
 * `reach`. 0 from inside a wall.
 */
export function sightRay(grid: Grid, x0: number, y0: number, angle: number, reach: number, wallDepth: number): number {
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

/** Whether sight from `eye` gets to spot `p`, at most `reach` px away (see sightRay). */
export function inSight(grid: Grid, eye: Point, p: Point, reach: number, wallDepth: number): boolean {
  const d = Math.hypot(p.x - eye.x, p.y - eye.y);
  if (d > reach) return false;
  return sightRay(grid, eye.x, eye.y, Math.atan2(p.y - eye.y, p.x - eye.x), reach, wallDepth) >= d - 1e-6;
}

/** Whether Dalton at `eye`, facing `aim`, sees spot `p` right now. */
export function seesSpot(grid: Grid, eye: Point, aim: number, shape: ViewShape, wallDepth: number, p: Point): boolean {
  if (viewLevel(p.x - eye.x, p.y - eye.y, aim, shape) < SEEN_LEVEL) return false;
  return inSight(grid, eye, p, viewReach(shape), wallDepth);
}

export interface ViewRay {
  angle: number;
  /** How far sight gets (see sightRay). */
  dist: number;
}

/** The angle between the pair of extra rays at a wall corner (one just past it, one just short). */
const CORNER_SPREAD = 1e-4;

const wrapAngle = (a: number) => (a < -Math.PI ? a + 2 * Math.PI : a >= Math.PI ? a - 2 * Math.PI : a);

/**
 * The outline of what can be seen from `origin`: rays all around it, sorted by angle from -π,
 * `spokes` evenly spaced plus a pair at every wall corner within reach, so the hidden parts start
 * exactly at the corners. See sightRay for `reach` and `wallDepth`.
 */
export function viewRays(grid: Grid, origin: Point, reach: number, wallDepth: number, spokes = 96): ViewRay[] {
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
  return angles.map((angle) => ({ angle, dist: sightRay(grid, origin.x, origin.y, angle, reach, wallDepth) }));
}

/**
 * What the walls hide, as triangles (x0, y0, x1, y1, x2, y2 each) for `push`: between each pair of
 * neighbouring rays, from where sight stops out to `far` px from the origin. A pair that gets its
 * full `reach` both times hides nothing (nothing beyond that is seen anyway).
 */
export function shadowTriangles(origin: Point, rays: readonly ViewRay[], reach: number, far: number, push: (...xy: number[]) => void): void {
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

// ---- what he has seen ------------------------------------------------------------------

/** A rectangle in world px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where to look for a thing standing on `rect` (world px): the middle of every tile it covers, and
 * its corners a quarter tile in. Seeing any of them sees the thing.
 */
export function footprintSpots(rect: Rect, tileSize: number): Point[] {
  const spots: Point[] = [];
  const cols = Math.max(1, Math.round(rect.width / tileSize));
  const rows = Math.max(1, Math.round(rect.height / tileSize));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) spots.push({ x: rect.x + ((i + 0.5) * rect.width) / cols, y: rect.y + ((j + 0.5) * rect.height) / rows });
  }
  const inX = Math.min(tileSize / 4, rect.width / 4);
  const inY = Math.min(tileSize / 4, rect.height / 4);
  for (const [fx, fy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    spots.push({ x: fx ? rect.x + rect.width - inX : rect.x + inX, y: fy ? rect.y + rect.height - inY : rect.y + inY });
  }
  return spots;
}

/**
 * Marks the tiles Dalton sees now as explored: `explored` holds a byte per tile, row by row
 * (`cols` to a row), 1 once seen. Only tiles not yet explored are checked. A tile is seen when its
 * middle is, or the point of it nearest him (so he explores a wall by seeing its face). Returns the
 * indexes of the tiles explored just now.
 */
export function exploreFrom(
  grid: Grid,
  eye: Point,
  aim: number,
  shape: ViewShape,
  wallDepth: number,
  explored: Uint8Array,
  cols: number,
  rows: number,
): number[] {
  const size = grid.tileSize;
  const reach = viewReach(shape);
  const x0 = Math.max(0, Math.floor((eye.x - reach) / size));
  const x1 = Math.min(cols - 1, Math.floor((eye.x + reach) / size));
  const y0 = Math.max(0, Math.floor((eye.y - reach) / size));
  const y1 = Math.min(rows - 1, Math.floor((eye.y + reach) / size));
  const found: number[] = [];
  const sees = (x: number, y: number) => seesSpot(grid, eye, aim, shape, wallDepth, { x, y });
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * cols + tx;
      if (explored[i]) continue;
      const left = tx * size;
      const top = ty * size;
      // The nearest point, a pixel inside the tile (in a wall: just past its face).
      const nx = Math.min(Math.max(eye.x, left + 1), left + size - 1);
      const ny = Math.min(Math.max(eye.y, top + 1), top + size - 1);
      if (sees(left + size / 2, top + size / 2) || sees(nx, ny)) {
        explored[i] = 1;
        found.push(i);
      }
    }
  }
  return found;
}

// ---- how places out of sight look ------------------------------------------------------

/** The hint of blue (0-255) in a fully gray memory, so it reads as cool fog rather than dirt. */
const COOL = 6;

/**
 * The colour matrix that shows what Dalton remembers: 4 rows of 5 (multipliers for red, green,
 * blue and alpha, then an offset in 0-255) for red, green, blue and alpha out. `gray` (0-1) takes
 * the colour out (1 is all gray), `light` (0-1) fades it toward white.
 */
export function memoryMatrix(gray: number, light: number): number[] {
  const g = clamp01(gray);
  const l = clamp01(light);
  const keep = 1 - l;
  const lum = [0.299, 0.587, 0.114];
  const row = (channel: number, extra: number) => [
    ...lum.map((w, i) => keep * (g * w + (i === channel ? 1 - g : 0))),
    0,
    255 * l + extra,
  ];
  return [...row(0, 0), ...row(1, 0), ...row(2, COOL * g), 0, 0, 0, 1, 0];
}

/** What `matrix` (see memoryMatrix) makes of an opaque colour [r, g, b] (0-255 each). */
export function applyMatrix(matrix: readonly number[], rgb: readonly [number, number, number]): [number, number, number] {
  const out = [0, 1, 2].map((c) => {
    const m = matrix.slice(c * 5, c * 5 + 5);
    return Math.round(Math.max(0, Math.min(255, m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2] + m[3] * 255 + m[4])));
  });
  return [out[0], out[1], out[2]];
}
