import { describe, expect, it } from 'vitest';
import { facingOf, nextFacing, restartDistance, sleepFrame, walkFrame, workFrame, wrapAngle } from './characterPose';

const deg = (d: number) => (d * Math.PI) / 180;

describe('facing', () => {
  it('picks the quarter the angle points into', () => {
    expect(facingOf(0)).toBe('right');
    expect(facingOf(deg(90))).toBe('down');
    expect(facingOf(deg(180))).toBe('left');
    expect(facingOf(deg(-90))).toBe('up');
    expect(facingOf(deg(270))).toBe('up');
    expect(facingOf(deg(-200))).toBe('left');
  });

  it('wraps angles into -PI..PI', () => {
    expect(wrapAngle(deg(270))).toBeCloseTo(deg(-90));
    expect(wrapAngle(deg(-270))).toBeCloseTo(deg(90));
    expect(wrapAngle(deg(45))).toBeCloseTo(deg(45));
  });

  it('keeps the current facing near the diagonals (no flicker)', () => {
    // Walking down-right at exactly 45 degrees, wobbling a little either way.
    for (const a of [40, 45, 50, 55]) expect(nextFacing('down', deg(a))).toBe('down');
    for (const a of [35, 40, 45, 50]) expect(nextFacing('right', deg(a))).toBe('right');
    // Clearly in another quarter: turn.
    expect(nextFacing('down', deg(20))).toBe('right');
    expect(nextFacing('right', deg(70))).toBe('down');
    expect(nextFacing('up', deg(90))).toBe('down');
    expect(nextFacing('left', deg(0))).toBe('right');
  });
});

describe('animation frames', () => {
  it('walks step, stand, other step, stand, paced by distance', () => {
    const stride = 20;
    expect([0, 20, 40, 60, 80].map((d) => walkFrame(d, stride))).toEqual([1, 0, 2, 0, 1]);
    expect(walkFrame(19, stride)).toBe(1);
    expect(walkFrame(-5, stride)).toBe(1);
  });

  it('starts the next walk on the other foot', () => {
    const stride = 20;
    // Stopped after the first step: next start is step 2.
    expect(walkFrame(restartDistance(25, stride), stride)).toBe(2);
    // Stopped after the second step: next start is step 1.
    expect(walkFrame(restartDistance(65, stride), stride)).toBe(1);
  });

  it('hammers and dozes in loops', () => {
    expect([0, 150, 300, 450].map((t) => workFrame(t))).toEqual([0, 1, 0, 1]);
    expect([0, 900, 1800].map((t) => sleepFrame(t))).toEqual([0, 1, 0]);
  });
});
