// Where the Studio's floating "◀ STUDIO" button goes during a play test: as near the top centre of
// the screen as it fits without covering any of the HUD's windows. Pure, so it is unit tested.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The top-left corner for a `w`×`h` button on a `width`×`height` screen: the highest spot that
 * keeps `gap` away from every box in `avoid`, and of those the one nearest the centre line.
 * Falls back to the top centre when nothing in the top half fits.
 */
export function topCentreSpot(width: number, height: number, w: number, h: number, avoid: readonly Box[], gap = 8): { x: number; y: number } {
  const centre = (width - w) / 2;
  const left = gap;
  const right = width - gap - w;
  if (right < left) return { x: Math.max(0, centre), y: gap };
  for (let y = gap; y + h <= height / 2; y += 2) {
    const top = y - gap;
    const bottom = y + h + gap;
    // Left edges that would bring the button within `gap` of a box in this band.
    const blocked = avoid
      .filter((b) => b.y < bottom && b.y + b.h > top)
      .map((b) => [b.x - gap - w, b.x + b.w + gap] as const)
      .sort((a, b) => a[0] - b[0]);
    let best: number | null = null;
    const consider = (from: number, to: number) => {
      if (to < from) return;
      const x = Math.min(Math.max(centre, from), to);
      if (best === null || Math.abs(x - centre) < Math.abs(best - centre)) best = x;
    };
    let cursor = left;
    for (const [a, b] of blocked) {
      consider(cursor, Math.min(a, right));
      cursor = Math.max(cursor, b);
    }
    consider(cursor, right);
    if (best !== null) return { x: best, y };
  }
  return { x: centre, y: gap };
}
