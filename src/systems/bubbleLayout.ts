// Keeps what's said over people's heads readable when they bunch up. Pure (no Phaser), so it's
// unit tested; GameScene applies it every frame to the speech bubbles and '!' / '?' marks.
//
//   - Speech bubbles never cover each other: the most important one (a shout before chatter, the
//     newest first) keeps its place, and any bubble in its way moves up above it (a longer tail
//     still points at whoever is talking). One that would end up too high is hidden for the moment.
//   - A '!' / '?' mark that a bubble covers is hidden while it does: the bubble says more.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bubble extends Box {
  /** Higher first: it keeps its place, lower ones move out of its way. */
  rank: number;
}

export interface StackRules {
  /** Space kept between two bubbles (px). */
  gap: number;
  /** A bubble moves up at most this far (px)... */
  maxLift: number;
  /** ...and never above this y (the top of the screen, px). */
  top: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * How far each bubble moves up (px, in the order given), or null for one hidden because there was
 * no room for it.
 */
export function stackBubbles(bubbles: readonly Bubble[], rules: StackRules): (number | null)[] {
  const order = bubbles.map((_, i) => i).sort((a, b) => bubbles[b].rank - bubbles[a].rank);
  const placed: Box[] = [];
  const lifts: (number | null)[] = bubbles.map(() => null);
  for (const i of order) {
    const b = bubbles[i];
    const at = { ...b };
    // Each step clears one bubble in the way, so this ends after at most `placed.length` steps.
    for (let guard = 0; guard <= placed.length; guard++) {
      const inWay = placed.filter((p) => overlaps(at, p));
      if (!inWay.length) break;
      at.y = Math.min(...inWay.map((p) => p.y)) - rules.gap - at.h;
    }
    const lift = b.y - at.y;
    if (lift > rules.maxLift || (lift > 0 && at.y < rules.top) || placed.some((p) => overlaps(at, p))) continue;
    lifts[i] = lift;
    placed.push(at);
  }
  return lifts;
}

/** Which marks (in the order given) some bubble covers. */
export function coveredMarks(marks: readonly (Box | null)[], bubbles: readonly Box[]): boolean[] {
  return marks.map((m) => m !== null && bubbles.some((b) => overlaps(m, b)));
}
