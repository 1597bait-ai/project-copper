// What a student thinks about Dalton, one frame at a time. Pure (no Phaser) so it can be unit
// tested; src/entities/Student.ts turns it into walking, turning and speech bubbles.
//
//   calm (hanging out) --sees him with scrap--> yell --> follow --(yells again every few seconds
//     while they can see him with scrap)--> no scrap in sight for a while --> calm, ignoring him for a bit
//   calm --on high alert, sees him empty-handed--> notice ('?' fills, faster up close) --full--> yell
//   Mr. Gravy catches him, or he's in disguise when they look: they calm down.

import type { Point } from './pathfinding';

export type Attention = 'calm' | 'notice' | 'yell' | 'follow';

/** Why a student yells: caught red-handed, recognised on high alert, or yelling again while following. */
export type Yell = 'redHanded' | 'suspect' | 'again';

export interface StudentMind {
  attention: Attention;
  /** 0-1, the '?' meter. Only fills on high alert while Dalton looks innocent. */
  suspicion: number;
  /** Seconds left of leaving Dalton alone (after giving up, or after Mr. Gravy caught him). */
  ignore: number;
  /** Seconds left of the current yell (standing still, pointing, shouting). */
  yellLeft: number;
  /** Seconds until they may yell again while following. */
  reyellIn: number;
  /**
   * Seconds since they last saw him red-handed while yelling or following. Seeing him empty-handed
   * doesn't count: they stare with a '?' and give up all the same, so an innocent Dalton can't
   * keep a follower (and the school's high alert) going forever.
   */
  lostFor: number;
}

export interface StudentSenses {
  /** He's inside their vision cone, in plain sight (not hidden behind a wall or passing as a student). */
  sees: boolean;
  /** He's inside their vision cone but passing as a student (Dalton's disguise): nothing to see here. */
  fooled?: boolean;
  /** He's carrying scrap or scrapping: the things that get him in trouble. */
  redHanded: boolean;
  /** Word got around: every student is watching for him. */
  highAlert: boolean;
  /** How far away he is, from 0 (right here) to 1 (the edge of their vision). */
  distance: number;
}

export interface MindTuning {
  noticeSecondsNear: number;
  noticeSecondsFar: number;
  suspicionDecay: number;
  yellSeconds: number;
  reyellSeconds: number;
  followGiveUpSeconds: number;
  ignoreSeconds: number;
}

export function newMind(): StudentMind {
  return { attention: 'calm', suspicion: 0, ignore: 0, yellLeft: 0, reyellIn: 0, lostFor: 0 };
}

/** Seconds of staring before an empty-handed Dalton gets yelled at (high alert only): quicker up close. */
export function noticeSeconds(distance: number, t: MindTuning): number {
  return t.noticeSecondsNear + (t.noticeSecondsFar - t.noticeSecondsNear) * Math.min(1, Math.max(0, distance));
}

/** Advances the mind by `dt` seconds. Returns why they start yelling this frame, or null. */
export function think(m: StudentMind, s: StudentSenses, dt: number, t: MindTuning): Yell | null {
  m.ignore = Math.max(0, m.ignore - dt);
  // Whoever was after him takes a good look and sees just another kid: they lose interest.
  if (s.fooled && m.attention !== 'calm') {
    calmDown(m, t.ignoreSeconds);
    return null;
  }
  const caught = s.sees && s.redHanded;
  switch (m.attention) {
    case 'yell':
      m.lostFor = caught ? 0 : m.lostFor + dt;
      m.reyellIn -= dt;
      if ((m.yellLeft -= dt) <= 0) m.attention = 'follow';
      return null;
    case 'follow':
      // The re-yell clock runs even while he's out of sight, so spotting him again sets them off at once.
      m.reyellIn -= dt;
      if (caught) {
        m.lostFor = 0;
        if (m.reyellIn <= 0) return startYell(m, t, 'again');
      } else if ((m.lostFor += dt) >= t.followGiveUpSeconds) {
        calmDown(m, t.ignoreSeconds);
      }
      return null;
  }

  // Calm, or staring with a '?'.
  if (m.ignore <= 0 && s.sees) {
    if (s.redHanded) return startYell(m, t, 'redHanded');
    if (s.highAlert) {
      m.attention = 'notice';
      m.suspicion = Math.min(1, m.suspicion + dt / noticeSeconds(s.distance, t));
      return m.suspicion >= 1 ? startYell(m, t, 'suspect') : null;
    }
  }
  m.suspicion = Math.max(0, m.suspicion - t.suspicionDecay * dt);
  if (m.attention === 'notice' && m.suspicion <= 0) m.attention = 'calm';
  return null;
}

function startYell(m: StudentMind, t: MindTuning, why: Yell): Yell {
  m.attention = 'yell';
  m.suspicion = 0;
  m.yellLeft = t.yellSeconds;
  m.reyellIn = t.reyellSeconds;
  m.lostFor = 0;
  return why;
}

/** Back to hanging out, leaving Dalton alone for `ignoreSeconds`. */
export function calmDown(m: StudentMind, ignoreSeconds: number): void {
  m.attention = 'calm';
  m.suspicion = 0;
  m.yellLeft = 0;
  m.lostFor = 0;
  m.ignore = Math.max(m.ignore, ignoreSeconds);
}

/**
 * Whether a yell that reaches Mr. Gravy counts as a report that (re)starts the school's high alert:
 * only when they saw him with scrap. An empty-handed Dalton recognised on high alert still gets
 * Mr. Gravy running over, but doesn't keep the alert going.
 */
export function yellRaisesAlarm(why: Yell): boolean {
  return why !== 'suspect';
}

/** How much this student lights up the HUD's red danger edge (0-1). */
export function mindDanger(m: StudentMind, weights: { notice: number; yelling: number; following: number }): number {
  switch (m.attention) {
    case 'yell':
      return weights.yelling;
    case 'follow':
      return weights.following;
    case 'notice':
      return m.suspicion * weights.notice;
    default:
      return 0;
  }
}

/** Following: stand and stare once close enough to see him, otherwise keep walking to where he was last seen. */
export function followHolds(sees: boolean, distance: number, keepDistance: number): boolean {
  return sees && distance <= keepDistance;
}

/** Mr. Gravy hears a yell within `range` (straight line: walls don't muffle a kid yelling his name). */
export function hearsYell(from: Point, listener: Point, range: number): boolean {
  const dx = listener.x - from.x;
  const dy = listener.y - from.y;
  return dx * dx + dy * dy <= range * range;
}

/**
 * Word spreads: given each student's distance from the yell, when (seconds from now) each one
 * starts talking about it. The nearest goes first, then the next `gap` seconds later, and so on,
 * each with up to `jitter` seconds of random delay so it doesn't sound rehearsed.
 */
export function chatterDelays(distances: number[], gap: number, jitter: number, rng: () => number): number[] {
  const order = distances.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
  const delays = new Array<number>(distances.length).fill(0);
  order.forEach(({ i }, rank) => (delays[i] = rank * gap + rng() * jitter));
  return delays;
}
