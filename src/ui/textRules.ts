// Pure text helpers for the pixel font (no Phaser, so they're unit tested). theme.ts uses them.

/** The pixel font for all text. */
export const FONT_NAME = 'Pixelify Sans';
/**
 * Pixelify Sans's 5 looks just like its S ("$50" reads "$S0", "7:05" reads "7:0S"), so digits come
 * from Jersey 15, a pixel font whose 5, 6, 8 and 9 stay clear even small, and look right next to
 * Pixelify's letters. Only its digits are used: every other character falls through to Pixelify
 * Sans. To try another digits font, put its file in src/assets/fonts/ (see fontFileName) and
 * change this name.
 */
export const DIGITS_FONT_NAME = 'Jersey 15';

/** The file a bundled font is in, in src/assets/fonts/: its name in lower case, dashes for spaces. */
export const fontFileName = (family: string): string => `${family.trim().toLowerCase().replace(/\s+/g, '-')}.woff2`;

/** True for dark CSS colours ('#333', '#14161c'): those get a light shadow and no outline. */
export function isDarkColor(css: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return false;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = parseInt(hex, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.5;
}

/** Shadow offset for a font size: about one pixel of the font's own pixel grid. */
export const shadowOffset = (size: number) => Math.max(1, Math.round(size / 14));

/** An "f" that the font would join to the next letter. */
export const LIGATURE = /f(?=[fil])/;

/**
 * Pixelify Sans draws its "fi" / "fl" / "ffi" ligatures like an "A" ("fifty" reads "Afty").
 * A zero-width non-joiner after such an "f" keeps the letters apart (it's invisible).
 */
export const breakLigatures = (s: string): string => (LIGATURE.test(s) ? s.replace(/f(?=[fil])/g, 'f‌') : s);
