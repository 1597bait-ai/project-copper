import { describe, expect, it } from 'vitest';
import { DIGITS_FONT_NAME, FONT_NAME, breakLigatures, fontFileName, isDarkColor } from './textRules';

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

  it('bundles a file for the text font and the digits font, with its licence', () => {
    expect(fontFileName('Jersey 15')).toBe('jersey-15.woff2');
    expect(fontFileName(' Pixelify  Sans ')).toBe('pixelify-sans.woff2');
    const bundled = Object.keys(import.meta.glob('../assets/fonts/*'));
    for (const name of [FONT_NAME, DIGITS_FONT_NAME]) {
      const file = `../assets/fonts/${fontFileName(name)}`;
      expect(bundled, name).toContain(file);
      expect(bundled, `licence for ${name}`).toContain(file.replace('.woff2', '-OFL.txt'));
    }
  });

  it('keeps the pixel font from joining f with i / l / f (its ligatures look like an "A")', () => {
    expect(breakLigatures('fifty office flow')).toBe('f‌ifty of‌f‌ice f‌low');
    expect(breakLigatures('Fill your bag')).toBe('Fill your bag');
    expect(breakLigatures('START SHIFT')).toBe('START SHIFT');
  });
});
