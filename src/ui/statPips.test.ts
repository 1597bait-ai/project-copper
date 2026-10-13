import { describe, expect, it } from 'vitest';
import { statPips } from './statPips';

describe('crew card stat pips', () => {
  it('shows the shipped stats as before: a whole pip per point', () => {
    expect(statPips(3, 3)).toEqual([1, 1, 1]);
    expect(statPips(1, 3)).toEqual([1, 0, 0]);
    expect(statPips(0, 3)).toEqual([0, 0, 0]);
  });

  it('fills half a pip for a half point', () => {
    expect(statPips(2.5, 3)).toEqual([1, 1, 0.5]);
  });

  it('measures against the highest stat past 3, so 3 and 8 look different', () => {
    expect(statPips(8, 8)).toEqual([1, 1, 1]);
    expect(statPips(3, 8)).toEqual([1, 0.25, 0]);
    expect(statPips(4, 8)).toEqual([1, 0.5, 0]);
  });
});
