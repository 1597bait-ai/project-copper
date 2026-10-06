// All the tuning knobs in one place. Distances are in tiles, times in seconds.

import type { RoomKind } from '../world/legend';

/** World pixels per map tile. */
export const TILE = 64;

export const BALANCE = {
  shift: {
    /** Real seconds in one shift. */
    lengthSeconds: 300,
    /** Clock shown on the HUD runs from startHour to endHour. */
    startHour: 7,
    endHour: 15,
    /** "Boss gets faster after X point": fraction of the shift when Mr. Gravy finishes his coffee. */
    bossSpeedUpAt: 0.5,
    bossSpeedUpMultiplier: 1.2,
    /** Fraction of the shift when the "almost over" reminder pops. */
    lastCallAt: 0.88,
  },

  /** "Three warnings, you're fired." */
  warningsUntilFired: 3,
  /** Seconds the boss ignores you after handing out a warning. */
  graceSeconds: 3,

  /** Speed stat -> tiles per second. Dalton (3) = 3.2, Dunkin (2) = 2.6, Tomothy (1) = 2.0. */
  tilesPerSecond: (speedStat: number) => 1.4 + 0.6 * speedStat,

  /** Carry stat -> bag capacity in scrap units. Dalton (carry 1) gets the board's "bag: 2". */
  bagCapacity: (carryStat: number) => 1 + carryStat,

  repair: {
    /** Fixture workSeconds are measured at this repair value. */
    reference: 2,
    /** Board: "if plumber on plumbing / hvac on hvac: +0.5 to repair". */
    specialtyBonus: 0.5,
    /** Board: "else: +0.25 repair". */
    otherBonus: 0.25,
  },

  /** How close (tiles, centre to centre) you need to be to scrap / unlock. */
  interactRangeTiles: 1.15,
  /** Extra tiles around the van that count as "at the van". */
  vanReachTiles: 0.7,

  doors: {
    unlockSeconds: 3,
  },

  boss: {
    /** Patrol speed as a fraction of chase speed. */
    patrolFactor: 0.62,
    waypointPause: [0.8, 1.8] as [number, number],
    /** Awareness stat -> how far the vision cone reaches (tiles). Mr. Gravy (2) = 5 tiles. */
    visionRangeTiles: (awareness: number) => 2.5 + 1.25 * awareness,
    /** Awareness stat -> half-angle of the vision cone (degrees). Mr. Gravy (2) = 40°, so an 80° cone. */
    visionHalfAngleDeg: (awareness: number) => 30 + 5 * awareness,
    /** Seconds of being seen before you're caught, close up -> at the edge of the cone (at awareness 2). */
    noticeSecondsNear: 0.9,
    noticeSecondsFar: 2.1,
    /** Suspicion level (0-1) where he stops staring and starts chasing. */
    chaseAt: 0.35,
    /** Suspicion lost per second while he can't see you. */
    suspicionDecay: 0.45,
    /** If he's suspicious and gets this close (tiles), you're caught. */
    catchRangeTiles: 0.7,
    /** Seconds he looks around where he last saw you. */
    searchSeconds: 2.5,
    /** When a student tells on you he sprints to the spot at this multiple of his chase speed. */
    sprintFactor: 1.35,
    /** Seconds he looks around the spot a student reported. */
    respondSearchSeconds: 3,
  },

  /**
   * Students (board: Speed 1, Awareness 1). See you with scrap and they yell for Mr. Gravy on the
   * spot, then slowly follow you, yelling again while they can see you. Once one gets through to
   * him, word spreads and every student is on high alert for a while.
   */
  students: {
    /** Strolling speed as a fraction of their Speed-stat pace (Speed 1 = 2.0 tiles/s -> 1.2). */
    walkFactor: 0.6,
    /** Following you after spotting you, as a fraction of their strolling speed (-> 0.6 tiles/s): easy to outwalk, hard to ignore. */
    followFactor: 0.5,
    /** How far a student's vision cone reaches (tiles). A bit further than Mr. Gravy's 5. */
    visionRangeTiles: 5.5,
    /** Half-angle of a student's vision cone (degrees), so an 80° cone. */
    visionHalfAngleDeg: 40,
    /**
     * Holding scrap or scrapping in front of them gets you yelled at instantly. Empty-handed you
     * only look suspicious on high alert: seconds of staring before they yell, close up -> at the
     * edge of the cone.
     */
    noticeSecondsNear: 1.2,
    noticeSecondsFar: 3,
    /** Suspicion lost per second while they can't see you. */
    suspicionDecay: 0.5,
    /** Students stroll to spots up to this many tiles from where they start. */
    wanderRadiusTiles: 8,
    /** Room kinds students stroll around in (never the office, boiler rooms, storage, janitor's closet or outside). */
    hangouts: ['hallway', 'classroom', 'lobby', 'restroom', 'lounge'] as RoomKind[],
    /** Seconds they stand and look around between strolls. */
    pauseSeconds: [1, 3] as [number, number],

    /** Seconds a yell lasts: they stand still, point at you and shout. */
    yellSeconds: 1.3,
    /** Mr. Gravy hears a yell from up to this many tiles away (straight line, walls don't muffle it). */
    yellHearingTiles: 14,
    /** While following, they yell again this often (seconds) whenever they can see you. */
    reyellSeconds: 4,
    /** Following: they stop and stare once they're this close (tiles). */
    followKeepTiles: 1.75,
    /** Following: they give up after this many seconds without seeing you. */
    followGiveUpSeconds: 6,
    /** Seconds after giving up (or after Mr. Gravy catches you) that they leave you alone. */
    ignoreSeconds: 8,

    /** Seconds every student stays on high alert after a report reaches Mr. Gravy (another report restarts it). */
    highAlertSeconds: 45,
    /** On high alert their vision cone reaches this much further... */
    highAlertRangeFactor: 1.3,
    /** ...and this many degrees wider on each side. */
    highAlertExtraHalfAngleDeg: 10,
    /** On high alert they stroll this much faster, pause this much shorter and look around this much more. */
    highAlertWalkFactor: 1.2,
    highAlertPauseFactor: 0.6,
    highAlertLookFactor: 1.6,
    /** Word spreads: when high alert starts, the student nearest the yell talks first, the next this many seconds later... */
    chatterGapSeconds: 0.6,
    /** ...plus up to this much random delay each. */
    chatterJitterSeconds: 0.5,
    /** On high alert each student says something every so often (seconds, random in this range). */
    chatterEverySeconds: [10, 20] as [number, number],

    /** How much each student lights up the red danger edge (0-1), relative to Mr. Gravy's chase (0.6+). */
    danger: {
      /** Times their '?' meter (high alert only). */
      notice: 0.6,
      yelling: 0.7,
      following: 0.45,
    },
    /** Seconds before the same student warning toast can show again. */
    toastCooldownSeconds: 5,
  },

  /**
   * The sleepy coworker naps under desks. Finish scrapping a desk and he may crawl out, panic, and
   * pay you to keep quiet. Then he shuffles off and is gone.
   */
  sleepyCoworker: {
    /** Chance (0-1) he's under a desk you just finished scrapping. */
    chance: 0.25,
    /** He turns up at most this many times per shift. */
    maxPerShift: 1,
    /** Dollars he pays you not to tell Mr. Gravy (counts toward the shift's earnings). */
    hushMoney: 50,
    /** Fixtures he naps under (ids from src/config/fixtures.ts). */
    napsUnder: ['desk'],
    /** Seconds he keeps snoozing beside the desk before jolting awake. */
    napSeconds: 1.5,
    /** Seconds of the jolt ('!') before he starts talking. */
    wakeSeconds: 0.7,
    /** Seconds each of his two dialog lines stays up. */
    lineSeconds: [2.4, 4.6] as [number, number],
    /** Shuffling off: speed (tiles/s), how far he tries to get from you (tiles), and the fade at the end (seconds). */
    shuffleTilesPerSecond: 0.9,
    shuffleTiles: 5,
    /** He fades out after this many seconds of shuffling even if he hasn't got there. */
    shuffleSeconds: 5,
    fadeSeconds: 0.8,
  },
};
