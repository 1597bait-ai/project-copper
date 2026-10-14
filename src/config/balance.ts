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

  /**
   * Speed stat -> walking speed: base + perSpeed x stat (tiles per second). Dalton (3) = 3.2,
   * Dunkin (2) = 2.6, Tomothy (1) = 2.0. Mr. Gravy and the students use the same rule.
   */
  movement: {
    baseTilesPerSecond: 1.4,
    tilesPerSecondPerSpeed: 0.6,
  },

  /** Carry stat -> bag capacity in scrap units: base + perCarry x stat. Dalton (carry 1) gets the board's "bag: 2". */
  bag: {
    baseCapacity: 1,
    capacityPerCarry: 1,
  },

  repair: {
    /** Fixture workSeconds are measured at this repair value. */
    reference: 2,
    /** Board: "if plumber on plumbing / hvac on hvac: +0.5 to repair". */
    specialtyBonus: 0.5,
    /** Board: "else: +0.25 repair". */
    otherBonus: 0.25,
  },

  /**
   * The camera on phones and other small screens (big screens show the map 1:1). It zooms out far
   * enough that any student who can see Dalton is on screen too, without people getting too small.
   */
  camera: {
    /** Tiles Dalton sees past the farthest a student sees (on high alert), out to the nearer screen edge. */
    seeBeyondTiles: 1,
    /** A tile is never drawn smaller than this many CSS pixels... */
    minTileCssPx: 24,
    /** ...nor bigger. Speech bubbles and '!' marks keep the size they have at this zoom. */
    maxTileCssPx: 34,
  },

  /**
   * Fog of war. You only see what's in your line of sight: walls and closed doors block it, so you
   * see into a room from its doorway. Everywhere else shows in light gray as you last saw it, with
   * nobody in it, and places you've never seen show the building's layout but not what's in the
   * rooms. See src/systems/fog.ts.
   */
  fog: {
    /** 'off' shows the whole school, everyone in it, all the time. */
    mode: 'on' as 'on' | 'off',
    /** How far you see (tiles)... */
    viewTiles: 10,
    /** ...and how wide (degrees): 360 sees all around you, less only the way you face... */
    viewAngleDeg: 360,
    /** ...plus this far all around you, your back included, when it's narrower (tiles). */
    nearTiles: 2,
    /** Seconds a narrower view takes to swing round when you turn (most of the way). */
    turnSeconds: 0.15,
    /**
     * Mr. Gravy, the students and the coworker out of your sight. 'hidden': gone, vision cones and
     * all. 'cones': gone, but their cones show where you can see the floor. 'shown': always seen.
     */
    people: 'hidden' as 'hidden' | 'cones' | 'shown',
    /** How washed out places you've never seen are (0-1). 0: like anywhere else out of sight. */
    unexploredHaze: 0.35,
    /** How much colour places out of sight lose (0-1): 1 is all gray. */
    gray: 1,
    /** How light they look (0-1): 0 keeps their brightness, 1 is white. */
    light: 0.45,
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
    /** Awareness stat -> how far the vision cone reaches: base + perAwareness x stat (tiles). Mr. Gravy (2) = 5 tiles. */
    visionRangeBaseTiles: 2.5,
    visionRangeTilesPerAwareness: 1.25,
    /** Awareness stat -> half-angle of the vision cone: base + perAwareness x stat (degrees). Mr. Gravy (2) = 40°, so an 80° cone. */
    visionHalfAngleBaseDeg: 30,
    visionHalfAngleDegPerAwareness: 5,
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
    /**
     * Strip his truck and he's furious for the rest of the shift. Each of these multiplies one of
     * his usual numbers: how far and how wide he sees (his cone at most 137° wide), how fast he
     * chases (and so sprints), how fast he walks his route on top of that, how long he takes to
     * catch you and from how close, how fast he forgets you, and how long he searches.
     */
    enraged: {
      rangeFactor: 1.4,
      halfAngleFactor: 1.35,
      speedFactor: 1.2,
      patrolFactor: 1.5,
      noticeFactor: 0.6,
      catchFactor: 1.3,
      decayFactor: 0.5,
      searchFactor: 2,
    },
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

// The rules that turn stats into numbers. Read BALANCE every time (never cache the results in a
// module), so values changed in Copper Studio apply to the next shift.

/** Speed stat -> tiles per second. */
export function tilesPerSecond(speedStat: number): number {
  return BALANCE.movement.baseTilesPerSecond + BALANCE.movement.tilesPerSecondPerSpeed * speedStat;
}

/** Carry stat -> bag capacity in scrap units. */
export function bagCapacity(carryStat: number): number {
  return BALANCE.bag.baseCapacity + BALANCE.bag.capacityPerCarry * carryStat;
}

/** Mr. Gravy's awareness stat -> how far his vision cone reaches (tiles). */
export function bossVisionRangeTiles(awareness: number): number {
  return BALANCE.boss.visionRangeBaseTiles + BALANCE.boss.visionRangeTilesPerAwareness * awareness;
}

/** Mr. Gravy's awareness stat -> half-angle of his vision cone (degrees). */
export function bossVisionHalfAngleDeg(awareness: number): number {
  return BALANCE.boss.visionHalfAngleBaseDeg + BALANCE.boss.visionHalfAngleDegPerAwareness * awareness;
}
