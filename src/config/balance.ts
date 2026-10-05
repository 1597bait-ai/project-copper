// All the tuning knobs in one place. Distances are in tiles, times in seconds.

/** World pixels per map tile. */
export const TILE = 64;

export const BALANCE = {
  shift: {
    /** Real seconds in one shift. */
    lengthSeconds: 240,
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
    patrolFactor: 0.55,
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
  },
};
