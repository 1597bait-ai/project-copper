import type { FixtureType } from './fixtures';

// Playable crew. Stat blocks are straight from the design board (Speed / Repair / Carry).
// Stats are converted to real numbers in config/balance.ts.

export type AbilityId = 'student_disguise' | 'look_busy';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  description: string;
  /** Seconds the ability lasts. */
  duration: number;
  /** Seconds before it can be used again (counted from activation). */
  cooldown: number;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  student_disguise: {
    id: 'student_disguise',
    name: 'Act Like a Student',
    description: "Mr. Gravy can't tell you're carrying scrap. Starting to scrap blows your cover.",
    duration: 5,
    cooldown: 20,
  },
  look_busy: {
    id: 'look_busy',
    name: "Act Like You're Working",
    description: 'Scrapping looks like real maintenance work, so nobody gets suspicious.',
    duration: 6,
    cooldown: 20,
  },
};

export interface CharacterStats {
  speed: number;
  repair: number;
  carry: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  stats: CharacterStats;
  /** Trade specialty: +repair bonus on matching fixtures (see BALANCE.repair). */
  specialty: FixtureType | null;
  ability: AbilityId | null;
  /** Sprite texture key (see src/art/sprites.ts). */
  sprite: string;
  /** Stat block colour from the design board. */
  color: number;
}

export const CHARACTERS: Record<string, CharacterDef> = {
  dalton: {
    id: 'dalton',
    name: 'Dalton',
    tagline: 'Faster movement, slower repair',
    stats: { speed: 3, repair: 2, carry: 1 },
    specialty: 'hvac', // guess — not on the board yet
    ability: 'student_disguise',
    sprite: 'dalton',
    color: 0x4caf50,
  },
  tomothy: {
    id: 'tomothy',
    name: 'Tomothy',
    tagline: 'Slower movement, faster repair',
    stats: { speed: 1, repair: 3, carry: 2 },
    specialty: 'plumbing', // guess — not on the board yet
    ability: 'look_busy',
    sprite: 'tomothy',
    color: 0x42a5f5,
  },
  dunkin: {
    id: 'dunkin',
    name: 'Dunkin',
    tagline: 'Carries the most scrap',
    stats: { speed: 2, repair: 1, carry: 3 },
    specialty: null,
    ability: null, // no special ability on the board yet
    sprite: 'dunkin',
    color: 0xef5350,
  },
};

export const CHARACTER_ORDER = ['dalton', 'tomothy', 'dunkin'];
