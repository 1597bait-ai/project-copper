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

  /** Students (board: Speed 1, Awareness 1) who run and tell Mr. Gravy when they catch you scrapping. */
  students: {
    /** Strolling speed as a fraction of their Speed-stat pace (Speed 1 = 2.0 tiles/s -> 1.2). */
    walkFactor: 0.6,
    /** Running-to-tell speed as a fraction of their pace: 3.0 tiles/s, a little slower than Dalton's 3.2. */
    runFactor: 1.5,
    /** How far a student's vision cone reaches (tiles). Shorter than Mr. Gravy's 5. */
    visionRangeTiles: 3.5,
    /** Half-angle of a student's vision cone (degrees), so a 70° cone. */
    visionHalfAngleDeg: 35,
    /** Seconds of watching you before they go and tell, close up -> at the edge of the cone. */
    noticeSecondsNear: 1,
    noticeSecondsFar: 2.2,
    /** Suspicion lost per second while they can't see you. */
    suspicionDecay: 0.5,
    /** Students stroll to spots up to this many tiles from where they start. */
    wanderRadiusTiles: 8,
    /** Room kinds students stroll around in (never the office, boiler rooms, storage, janitor's closet or outside). */
    hangouts: ['hallway', 'classroom', 'lobby', 'restroom', 'lounge'] as RoomKind[],
    /** Seconds they stand and look around between strolls. */
    pauseSeconds: [1, 3] as [number, number],
    /** Seconds they stand and shout before running off to tell. */
    shoutSeconds: 0.4,
    /** How close (tiles) they need to get to Mr. Gravy to tell him. */
    reportRangeTiles: 1.4,
    /** Seconds they stand there telling him. */
    reportPauseSeconds: 1.5,
    /** Seconds after telling (or giving up) that they ignore you. */
    ignoreSeconds: 8,
    /** Seconds of trying to reach Mr. Gravy before they give up and go back to wandering. */
    giveUpSeconds: 20,
    /** How much a student watching you lights up the red danger edge, relative to Mr. Gravy. */
    dangerWeight: 0.6,
    /** Seconds before the same student warning toast can show again. */
    toastCooldownSeconds: 5,
  },
};
