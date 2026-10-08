// The sleepy coworker's rules: when he turns up, where he crawls out from under the desk, where he
// shuffles off to, and what he says. Pure (no Phaser) so it can be unit tested.

import type { Grid } from './Grid';
import type { Point } from './pathfinding';

/** Whether he's napping under the desk just scrapped. `roll` is a random number in [0, 1). */
export function coworkerWakes(chance: number, appeared: number, maxPerShift: number, roll: number): boolean {
  return appeared < maxPerShift && roll < chance;
}

/** Tiles next to a desk in the order he'd crawl out to: in front (below) first, then the sides, then behind. */
const BESIDE: readonly (readonly [number, number])[] = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [1, 1],
  [0, -1],
  [-1, -1],
  [1, -1],
];

/**
 * The open tile beside `desk` (tile coordinates) where he appears. Keeps clear of Dalton's tile
 * (`avoid`) and the tiles straight above, below and beside it when there's any other choice: he
 * isn't solid, and people are taller than a tile, so right above or below Dalton the two of them
 * would overlap and his '!' would look like Dalton's.
 */
export function besideDesk(grid: Grid, desk: Point, avoid: Point | null): Point | null {
  const open = BESIDE.map(([dx, dy]) => ({ x: desk.x + dx, y: desk.y + dy })).filter((t) => !grid.blocked(t.x, t.y));
  const steps = (t: Point) => (avoid ? Math.abs(t.x - avoid.x) + Math.abs(t.y - avoid.y) : Infinity);
  const diagonal = (t: Point) => avoid !== null && Math.abs(t.x - avoid.x) === 1 && Math.abs(t.y - avoid.y) === 1;
  return open.find((t) => steps(t) > 1 || diagonal(t)) ?? open.find((t) => steps(t) > 0) ?? open[0] ?? null;
}

/**
 * Where he shuffles off to: of the open tiles he can walk to within `radius` steps of `from`, the
 * one farthest from `away` (Dalton). Returns `from` if he's boxed in.
 */
export function shuffleTarget(grid: Grid, from: Point, away: Point, radius: number): Point {
  let best = from;
  let bestScore = -1;
  const steps = new Map<number, number>([[from.y * grid.width + from.x, 0]]);
  const queue: Point[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const step = steps.get(c.y * grid.width + c.x)!;
    const score = (c.x - away.x) ** 2 + (c.y - away.y) ** 2;
    if (score > bestScore) [best, bestScore] = [c, score];
    if (step >= radius) continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: c.x + dx, y: c.y + dy };
      const key = n.y * grid.width + n.x;
      if (grid.blocked(n.x, n.y) || steps.has(key)) continue;
      steps.set(key, step + 1);
      queue.push(n);
    }
  }
  return best;
}

/** Fills in `{money}` in one of his lines: "$50", or "$12.50" for an amount with cents. */
export function coworkerLine(template: string, amount: number): string {
  const text = Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
  return template.split('{money}').join(text);
}
