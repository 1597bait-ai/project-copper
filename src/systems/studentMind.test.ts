import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import {
  calmDown,
  chatterDelays,
  followHolds,
  hearsYell,
  mindDanger,
  newMind,
  noticeSeconds,
  think,
  type MindTuning,
  type StudentSenses,
} from './studentMind';

const T: MindTuning = {
  noticeSecondsNear: 1,
  noticeSecondsFar: 3,
  suspicionDecay: 0.5,
  yellSeconds: 1,
  reyellSeconds: 4,
  followGiveUpSeconds: 6,
  ignoreSeconds: 8,
};
const DT = 1 / 60;

const senses = (over: Partial<StudentSenses> = {}): StudentSenses => ({
  sees: true,
  redHanded: false,
  highAlert: false,
  distance: 0.5,
  ...over,
});

/** Runs the mind for `seconds` with the same senses; returns every yell it started. */
function run(m: ReturnType<typeof newMind>, s: StudentSenses, seconds: number) {
  const yells = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const y = think(m, s, DT, T);
    if (y) yells.push(y);
  }
  return yells;
}

describe('student mind: seeing Dalton', () => {
  it('ignores an empty-handed Dalton when there is no alert', () => {
    const m = newMind();
    expect(run(m, senses(), 5)).toEqual([]);
    expect(m.attention).toBe('calm');
    expect(m.suspicion).toBe(0);
  });

  it('yells on the very first frame they see him holding scrap, even at the edge of their vision', () => {
    const m = newMind();
    expect(think(m, senses({ redHanded: true, distance: 1 }), DT, T)).toBe('redHanded');
    expect(m.attention).toBe('yell');
  });

  it("doesn't yell about scrap it can't see", () => {
    const m = newMind();
    expect(run(m, senses({ sees: false, redHanded: true }), 3)).toEqual([]);
    expect(m.attention).toBe('calm');
  });

  it('leaves him alone while ignoring him, then yells again once that runs out', () => {
    const m = newMind();
    m.ignore = 2;
    expect(run(m, senses({ redHanded: true }), 1.9)).toEqual([]);
    expect(run(m, senses({ redHanded: true }), 0.2)).toEqual(['redHanded']);
  });
});

describe('student mind: high alert', () => {
  it('gets suspicious of an empty-handed Dalton and yells when the meter fills', () => {
    const m = newMind();
    expect(run(m, senses({ highAlert: true, distance: 0 }), 0.5)).toEqual([]);
    expect(m.attention).toBe('notice');
    expect(m.suspicion).toBeGreaterThan(0.4);
    expect(run(m, senses({ highAlert: true, distance: 0 }), 0.6)).toEqual(['suspect']);
    expect(m.attention).toBe('yell');
  });

  it('fills faster up close than far away', () => {
    expect(noticeSeconds(0, T)).toBe(1);
    expect(noticeSeconds(1, T)).toBe(3);
    expect(noticeSeconds(5, T)).toBe(3);
    const near = newMind();
    const far = newMind();
    run(near, senses({ highAlert: true, distance: 0.1 }), 0.5);
    run(far, senses({ highAlert: true, distance: 0.9 }), 0.5);
    expect(near.suspicion).toBeGreaterThan(far.suspicion);
  });

  it('cools off and goes back to calm when he walks out of sight', () => {
    const m = newMind();
    run(m, senses({ highAlert: true, distance: 0 }), 0.5);
    run(m, senses({ sees: false, highAlert: true }), 2);
    expect(m.suspicion).toBe(0);
    expect(m.attention).toBe('calm');
  });

  it('still yells instantly at scrap', () => {
    const m = newMind();
    run(m, senses({ highAlert: true }), 0.3);
    expect(think(m, senses({ highAlert: true, redHanded: true }), DT, T)).toBe('redHanded');
  });
});

describe('student mind: yelling and following', () => {
  it('stands and yells, then follows', () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    run(m, senses({ redHanded: true }), 0.9);
    expect(m.attention).toBe('yell');
    run(m, senses({ redHanded: true }), 0.2);
    expect(m.attention).toBe('follow');
  });

  it('yells again every few seconds while it can see him (scrap or not)', () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    // 1s of yelling, then following: the next yell comes reyellSeconds after the first.
    const yells = run(m, senses(), 8.5);
    expect(yells).toEqual(['again', 'again']);
  });

  it("doesn't yell while it can't see him, but yells as soon as it spots him again", () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    expect(run(m, senses({ sees: false }), 5)).toEqual([]);
    expect(m.attention).toBe('follow');
    expect(think(m, senses(), DT, T)).toBe('again');
  });

  it('gives up after losing him for a while, then ignores him', () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    // The clock counts from the last sighting, yell included.
    run(m, senses({ sees: false }), 5.5);
    expect(m.attention).toBe('follow');
    run(m, senses({ sees: false }), 0.6);
    expect(m.attention).toBe('calm');
    expect(m.ignore).toBeGreaterThan(7);
    expect(run(m, senses({ redHanded: true }), 5)).toEqual([]);
  });

  it('a glimpse of him resets the give-up clock', () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    run(m, senses({ sees: false }), 5);
    think(m, senses(), DT, T);
    run(m, senses({ sees: false }), 5);
    expect(m.attention).not.toBe('calm');
  });

  it('calms down when Mr. Gravy catches him', () => {
    const m = newMind();
    think(m, senses({ redHanded: true }), DT, T);
    calmDown(m, 8);
    expect(m.attention).toBe('calm');
    expect(m.ignore).toBe(8);
    expect(run(m, senses({ redHanded: true }), 1)).toEqual([]);
  });

  it('stops at a distance while it can see him, walks on when it cannot', () => {
    expect(followHolds(true, 100, 112)).toBe(true);
    expect(followHolds(true, 200, 112)).toBe(false);
    expect(followHolds(false, 50, 112)).toBe(false);
  });
});

describe('danger from students', () => {
  const w = { notice: 0.6, yelling: 0.7, following: 0.45 };
  it('counts yelling and following students, and the ? meter', () => {
    const m = newMind();
    expect(mindDanger(m, w)).toBe(0);
    run(m, senses({ highAlert: true, distance: 0 }), 0.5);
    expect(mindDanger(m, w)).toBeCloseTo(m.suspicion * 0.6);
    think(m, senses({ redHanded: true }), DT, T);
    expect(mindDanger(m, w)).toBe(0.7);
    run(m, senses(), 1.1);
    expect(mindDanger(m, w)).toBe(0.45);
  });
});

describe('yelling for Mr. Gravy', () => {
  it('reaches him in a straight line up to the hearing range', () => {
    expect(hearsYell({ x: 0, y: 0 }, { x: 300, y: 400 }, 500)).toBe(true);
    expect(hearsYell({ x: 0, y: 0 }, { x: 300, y: 401 }, 500)).toBe(false);
  });

  it('is tuned to carry a fair way, but not across the whole school', () => {
    expect(BALANCE.students.yellHearingTiles).toBeGreaterThan(BALANCE.students.visionRangeTiles * 1.5);
    expect(BALANCE.students.yellHearingTiles).toBeLessThan(25);
  });
});

describe('word spreading', () => {
  it('starts with the nearest student and spaces the rest out', () => {
    const delays = chatterDelays([500, 100, 300], 0.6, 0, () => 0.5);
    expect(delays).toEqual([1.2, 0, 0.6]);
  });

  it('adds up to `jitter` of random delay', () => {
    const delays = chatterDelays([100, 200], 1, 0.5, () => 0.999);
    expect(delays[0]).toBeCloseTo(0.4995);
    expect(delays[1]).toBeCloseTo(1.4995);
  });
});

describe('student balance', () => {
  it('follows well below walking speed', () => {
    expect(BALANCE.students.followFactor).toBeLessThanOrEqual(0.6);
    expect(BALANCE.students.followFactor).toBeGreaterThan(0.2);
  });

  it('sees further and wider than before, and further still on high alert', () => {
    const s = BALANCE.students;
    expect(s.visionRangeTiles).toBeGreaterThanOrEqual(5);
    expect(s.visionHalfAngleDeg).toBeGreaterThanOrEqual(40);
    expect(s.highAlertRangeFactor).toBeGreaterThan(1);
    expect(s.highAlertExtraHalfAngleDeg).toBeGreaterThan(0);
  });
});
