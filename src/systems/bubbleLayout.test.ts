import { describe, expect, it } from 'vitest';
import { coveredMarks, overlaps, stackBubbles, type Bubble } from './bubbleLayout';

const RULES = { gap: 4, maxLift: 200, top: -1000 };
const bubble = (x: number, y: number, rank: number, w = 100, h = 40): Bubble => ({ x, y, w, h, rank });

describe('speech bubbles that would overlap', () => {
  it('leaves bubbles alone when they are apart', () => {
    expect(stackBubbles([bubble(0, 0, 1), bubble(200, 0, 2)], RULES)).toEqual([0, 0]);
    expect(overlaps(bubble(0, 0, 1), bubble(100, 0, 1))).toBe(false);
  });

  it('moves the less important one up, just above the other', () => {
    // A chat line (rank 1) and a shout (rank 5) side by side, half overlapping.
    expect(stackBubbles([bubble(0, 0, 1), bubble(50, 10, 5)], RULES)).toEqual([34, 0]);
  });

  it('stacks a crowd one above the other, the most important lowest', () => {
    const lifts = stackBubbles([bubble(0, 100, 1), bubble(10, 100, 3), bubble(20, 100, 2)], RULES);
    expect(lifts).toEqual([88, 0, 44]);
  });

  it('keeps going up past every bubble in the way', () => {
    // The third one first clears the shout, then lands in the chat line already moved above it.
    const lifts = stackBubbles([bubble(0, 0, 9), bubble(0, -44, 8, 100, 40), bubble(0, 0, 1)], RULES);
    expect(lifts[0]).toBe(0);
    expect(lifts[1]).toBe(0);
    expect(lifts[2]).toBe(88);
  });

  it('hides a bubble that would have to move too far, or off the top of the screen', () => {
    expect(stackBubbles([bubble(0, 0, 2), bubble(0, 0, 1)], { ...RULES, maxLift: 30 })).toEqual([0, null]);
    expect(stackBubbles([bubble(0, 0, 2), bubble(0, 0, 1)], { ...RULES, top: -20 })).toEqual([0, null]);
    // Without anything in the way, a bubble near the top stays.
    expect(stackBubbles([bubble(0, -50, 1)], { ...RULES, top: -20 })).toEqual([0]);
  });

  it('keeps the input order in the result', () => {
    const lifts = stackBubbles([bubble(0, 0, 1), bubble(500, 0, 1), bubble(10, 0, 2)], RULES);
    expect(lifts).toEqual([44, 0, 0]);
  });
});

describe("'!' and '?' marks under bubbles", () => {
  it('hides the marks a bubble covers', () => {
    const marks = [{ x: 0, y: 0, w: 40, h: 40 }, { x: 300, y: 0, w: 40, h: 40 }, null];
    expect(coveredMarks(marks, [bubble(20, 20, 1)])).toEqual([true, false, false]);
    expect(coveredMarks(marks, [])).toEqual([false, false, false]);
  });
});
