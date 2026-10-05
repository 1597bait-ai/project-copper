import { BALANCE } from '../config/balance';
import type { FixtureDef, FixtureType } from '../config/fixtures';
import { roundScrap } from './Bag';

export type Rng = () => number;

/** Board: "if plumber on plumbing: +0.5 to repair, if hvac on hvac: +0.5 to repair, else: +0.25 repair". */
export function effectiveRepair(repairStat: number, specialty: FixtureType | null, fixtureType: FixtureType): number {
  const bonus = specialty !== null && specialty === fixtureType ? BALANCE.repair.specialtyBonus : BALANCE.repair.otherBonus;
  return repairStat + bonus;
}

/** Seconds it takes to strip a fixture at a given effective repair value. */
export function scrapSeconds(fixture: FixtureDef, repair: number): number {
  return (fixture.workSeconds * BALANCE.repair.reference) / Math.max(0.25, repair);
}

/** Scrap yield: fixed, or random within the fixture's low/high range (to the nearest 0.05). */
export function rollYield(fixture: FixtureDef, rng: Rng = Math.random): number {
  if (!fixture.range) return fixture.scrap;
  const [low, high] = fixture.range;
  return roundScrap(Math.round((low + rng() * (high - low)) * 20) / 20);
}

export function rollRecharge(fixture: FixtureDef, rng: Rng = Math.random): number {
  const [min, max] = fixture.recharge;
  return min + rng() * (max - min);
}
