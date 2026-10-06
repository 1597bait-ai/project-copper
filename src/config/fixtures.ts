import type { MaterialId } from './materials';

// Everything Dalton can strip for scrap. One entry per sticky note on the design board.
// To add a new fixture: add an entry here, draw a sprite in src/art/sprites.ts,
// then place it on a map in Tiled (object layer "objects", type "fixture", name = id).

/** Trade type. Characters get a repair bonus on fixtures that match their specialty. */
export type FixtureType = 'plumbing' | 'hvac' | 'free' | 'general';

export type ValueTier = 'very high' | 'high' | 'medium' | 'low';

export interface FixtureDef {
  id: string;
  name: string;
  tier: ValueTier;
  type: FixtureType;
  material: MaterialId;
  /** Average scrap yield. */
  scrap: number;
  /** Optional random yield range [low, high]. Without it, yield is always `scrap`. */
  range?: [number, number];
  /** Seconds before the fixture can be scrapped again: random in [min, max]. */
  recharge: [number, number];
  /** Seconds to strip it at the reference repair stat (see BALANCE.repair). Not on the board yet — tune freely. */
  workSeconds: number;
  /** Blocks movement (and pathfinding). */
  solid: boolean;
  /** Mounted on a wall: the sprite auto-rotates to face away from the nearest wall. */
  wallMounted: boolean;
}

export const FIXTURES: Record<string, FixtureDef> = {
  abandoned_copper_pile: {
    id: 'abandoned_copper_pile',
    name: 'Abandoned Copper Pile',
    tier: 'very high',
    type: 'free',
    material: 'bare_bright', // top-grade copper: the reason to go deep
    scrap: 1.5,
    recharge: [60, 120],
    workSeconds: 1.5,
    solid: false,
    wallMounted: false,
  },
  drinking_fountain: {
    id: 'drinking_fountain',
    name: 'Drinking Fountain',
    tier: 'high',
    type: 'plumbing',
    material: 'copper',
    scrap: 1,
    recharge: [45, 60],
    workSeconds: 4,
    solid: true,
    wallMounted: true,
  },
  wall_heater: {
    id: 'wall_heater',
    name: 'Wall Heater',
    tier: 'high', // tier not on the board yet
    type: 'hvac',
    material: 'copper', // guess: copper coils
    scrap: 1,
    recharge: [45, 60],
    workSeconds: 4,
    solid: true,
    wallMounted: true,
  },
  toilet: {
    id: 'toilet',
    name: 'Toilet',
    tier: 'medium',
    type: 'plumbing',
    material: 'brass', // guess: brass flush valve
    scrap: 0.5,
    range: [0.25, 0.75],
    recharge: [30, 45],
    workSeconds: 3,
    solid: true,
    wallMounted: true,
  },
  mop_sink: {
    id: 'mop_sink',
    name: 'Mop Sink',
    tier: 'low',
    type: 'plumbing',
    material: 'brass', // guess: brass faucet
    scrap: 0.5,
    range: [0.25, 0.75],
    recharge: [30, 45],
    workSeconds: 3,
    solid: true,
    wallMounted: true,
  },
  // Desk and Lamp use the two "(name)" sticky notes (scrap 1, low 0.8, high 1.2, recharge 45-60s).
  desk: {
    id: 'desk',
    name: 'Desk',
    tier: 'low',
    type: 'general',
    material: 'steel', // board: Desk = steel
    scrap: 1,
    range: [0.8, 1.2],
    recharge: [45, 60],
    workSeconds: 3,
    solid: true,
    wallMounted: false,
  },
  lamp: {
    id: 'lamp',
    name: 'Lamp',
    tier: 'medium',
    type: 'general',
    material: 'copper', // board: Lamp = copper
    scrap: 1,
    range: [0.8, 1.2],
    recharge: [45, 60],
    workSeconds: 2.5,
    solid: true,
    wallMounted: false,
  },
};

export const TIER_COLORS: Record<ValueTier, number> = {
  'very high': 0xff7a2f,
  high: 0xffb13b,
  medium: 0xe8d36a,
  low: 0xa9b4bf,
};
