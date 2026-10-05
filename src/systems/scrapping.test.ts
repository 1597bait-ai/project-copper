import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../config/fixtures';
import { effectiveRepair, rollRecharge, rollYield, scrapSeconds } from './scrapping';

describe('repair bonus (design board rule)', () => {
  it('gives +0.5 to a plumber on plumbing and hvac on hvac', () => {
    expect(effectiveRepair(3, 'plumbing', 'plumbing')).toBe(3.5);
    expect(effectiveRepair(2, 'hvac', 'hvac')).toBe(2.5);
  });

  it('gives +0.25 otherwise', () => {
    expect(effectiveRepair(2, 'hvac', 'plumbing')).toBe(2.25);
    expect(effectiveRepair(1, null, 'free')).toBe(1.25);
  });
});

describe('scrapping', () => {
  it('higher repair strips faster', () => {
    const fountain = FIXTURES.drinking_fountain;
    expect(scrapSeconds(fountain, 2)).toBeCloseTo(4);
    expect(scrapSeconds(fountain, 2.25)).toBeCloseTo(3.556, 2);
    expect(scrapSeconds(fountain, 3.5)).toBeLessThan(scrapSeconds(fountain, 2.25));
  });

  it('fixed yields are always the same', () => {
    expect(rollYield(FIXTURES.abandoned_copper_pile, () => 0.9)).toBe(1.5);
  });

  it('ranged yields stay within low/high', () => {
    const toilet = FIXTURES.toilet;
    expect(rollYield(toilet, () => 0)).toBe(0.25);
    expect(rollYield(toilet, () => 0.999)).toBe(0.75);
    for (let i = 0; i < 200; i++) {
      const y = rollYield(toilet);
      expect(y).toBeGreaterThanOrEqual(0.25);
      expect(y).toBeLessThanOrEqual(0.75);
    }
  });

  it('recharge time is within the board range', () => {
    expect(rollRecharge(FIXTURES.abandoned_copper_pile, () => 0)).toBe(60);
    expect(rollRecharge(FIXTURES.abandoned_copper_pile, () => 1)).toBe(120);
  });
});
