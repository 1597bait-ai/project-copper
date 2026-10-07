import { describe, expect, it } from 'vitest';
import { breakLigatures, isDarkColor } from './textRules';

describe('theme', () => {
  it('tells dark text colours (light shadow, no outline) from light ones', () => {
    expect(isDarkColor('#3a3e4c')).toBe(true);
    expect(isDarkColor('#14161c')).toBe(true);
    expect(isDarkColor('#c0602a')).toBe(true);
    expect(isDarkColor('#f8f8f0')).toBe(false);
    expect(isDarkColor('#ff6450')).toBe(false);
    expect(isDarkColor('#fff')).toBe(false);
    expect(isDarkColor('rgba(0,0,0,0.5)')).toBe(false);
  });

  it('keeps the pixel font from joining f with i / l / f (its ligatures look like an "A")', () => {
    expect(breakLigatures('fifty office flow')).toBe('f‌ifty of‌f‌ice f‌low');
    expect(breakLigatures('Fill your bag')).toBe('Fill your bag');
    expect(breakLigatures('START SHIFT')).toBe('START SHIFT');
  });
});
