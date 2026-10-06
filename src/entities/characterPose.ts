// Which frame a person shows: facing, walk cycle, hammering and dozing loops. Pure functions (no
// Phaser), used by CharacterView and unit tested.

export type Facing = 'down' | 'up' | 'left' | 'right';

/** The angle each facing points at (radians, 0 = right, PI/2 = down). */
const AXIS: Record<Facing, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

/** Wraps an angle into -PI..PI. */
export function wrapAngle(a: number): number {
  const t = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return t - Math.PI;
}

/** Which way a sprite faces for an angle in radians (0 = right, PI/2 = down). */
export function facingOf(angle: number): Facing {
  const a = wrapAngle(angle);
  if (a > Math.PI / 4 && a < (3 * Math.PI) / 4) return 'down';
  if (a < -Math.PI / 4 && a > (-3 * Math.PI) / 4) return 'up';
  return Math.abs(a) <= Math.PI / 4 ? 'right' : 'left';
}

/** How far past the 45 degree line an angle must go before the facing changes. */
export const FACING_HYSTERESIS = (15 * Math.PI) / 180;

/**
 * Like facingOf, but sticky: keeps the current facing until the angle is clearly in another
 * quarter, so walking diagonally (or a wobbly stick) doesn't flicker between two facings.
 */
export function nextFacing(current: Facing, angle: number, margin = FACING_HYSTERESIS): Facing {
  if (Math.abs(wrapAngle(angle - AXIS[current])) <= Math.PI / 4 + margin) return current;
  return facingOf(angle);
}

/** Walking frames in order: step, stand, other step, stand. */
export const WALK_CYCLE = [1, 0, 2, 0] as const;

/** Walking: one frame per stride of distance (px), so the feet keep pace with the ground. */
export function walkFrame(distance: number, stride: number): 0 | 1 | 2 {
  const i = Math.floor(Math.max(0, distance) / stride) % WALK_CYCLE.length;
  return WALK_CYCLE[i];
}

/**
 * Where the walk cycle should resume after stopping: the next start takes the other foot,
 * like in the Pokemon games.
 */
export function restartDistance(distance: number, stride: number): number {
  const i = Math.floor(Math.max(0, distance) / stride) % WALK_CYCLE.length;
  return i < 2 ? 2 * stride : 0;
}

/** Hammering: arm up / arm down. */
export function workFrame(timeMs: number, periodMs = 150): 0 | 1 {
  return (Math.floor(timeMs / periodMs) % 2) as 0 | 1;
}

/** Dozing: slow breathing. */
export function sleepFrame(timeMs: number, periodMs = 900): 0 | 1 {
  return (Math.floor(timeMs / periodMs) % 2) as 0 | 1;
}
