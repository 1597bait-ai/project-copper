// The HUD's edge markers: a '!' or '?' at the edge of the screen pointing at someone who is onto
// Dalton but can't be seen (off screen, or under one of the HUD's windows). Pure, so it's tested.

import type { Point } from './pathfinding';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface EdgeSpot extends Point {
  /** The edge it's on: its arrow points out past it. */
  side: Side;
}

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Whether something at `p` can be seen: on the screen, and not under one of the HUD's windows. */
export function inSight(p: Point, screen: Rect, covers: readonly Rect[]): boolean {
  return inside(p, screen) && !covers.some((c) => inside(p, c));
}

/** Where the line from `from` (Dalton) towards `to` leaves `area` (the part of the screen markers use). */
export function edgeSpot(from: Point, to: Point, area: Rect): EdgeSpot {
  const right = area.x + area.w;
  const bottom = area.y + area.h;
  const f = { x: Math.min(right, Math.max(area.x, from.x)), y: Math.min(bottom, Math.max(area.y, from.y)) };
  const dx = to.x - f.x;
  const dy = to.y - f.y;
  // How far along the line each pair of sides is (Infinity when the line runs parallel to them).
  const tx = dx > 0 ? (right - f.x) / dx : dx < 0 ? (area.x - f.x) / dx : Infinity;
  const ty = dy > 0 ? (bottom - f.y) / dy : dy < 0 ? (area.y - f.y) / dy : Infinity;
  if (tx === Infinity && ty === Infinity) return { x: f.x, y: area.y, side: 'top' };
  const t = Math.min(tx, ty);
  const side: Side = tx <= ty ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
  return { x: f.x + dx * t, y: f.y + dy * t, side };
}

/**
 * Markers in the order given (most urgent first), leaving out any closer than `gap` to one
 * already kept: a crowd in one direction gets one marker.
 */
export function spreadOut<T extends Point>(markers: readonly T[], gap: number): T[] {
  const kept: T[] = [];
  for (const m of markers) if (kept.every((k) => Math.hypot(k.x - m.x, k.y - m.y) >= gap)) kept.push(m);
  return kept;
}
