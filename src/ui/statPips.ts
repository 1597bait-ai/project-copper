// How full each of a crew card's three stat pips is. The shipped stats are whole numbers up to 3,
// a pip each; Copper Studio allows up to 8 in half steps, so the pips then stand for a share of the
// crew's highest stat (and fill partly), and a stat of 8 still looks bigger than a 3.

/** Fill of each pip, 0..1 in quarters: `value` against the highest stat shown (at least `count`). */
export function statPips(value: number, highest: number, count = 3): number[] {
  const filled = (Math.max(0, value) * count) / Math.max(count, highest);
  return Array.from({ length: count }, (_, i) => Math.round(Math.min(1, Math.max(0, filled - i)) * 4) / 4);
}
