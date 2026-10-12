import { afterEach, describe, expect, it } from 'vitest';
import { applyTuning, emptyTuning } from '../config/tuning';
import { balanceLabel, currentBalanceLabel, setPlayTestLabel, shortDate } from './balanceLabel';

afterEach(() => {
  applyTuning(emptyTuning());
  setPlayTestLabel(null);
});

describe('the balance label', () => {
  it('says nothing for the shipped values', () => {
    expect(balanceLabel(emptyTuning())).toBeNull();
    expect(currentBalanceLabel()).toBeNull();
  });

  it('names the version and the day it was saved', () => {
    expect(balanceLabel({ revision: 3, savedAt: '2026-10-12T12:00:00Z' })).toBe('Balance v3 · 12 Oct 2026');
    expect(balanceLabel({ revision: 3, savedAt: 'garbage' })).toBe('Balance v3');
    expect(shortDate(null)).toBe('');
    applyTuning({ ...emptyTuning(), revision: 5, savedAt: '2026-01-02T12:00:00Z' });
    expect(currentBalanceLabel()).toBe('Balance v5 · 2 Jan 2026');
  });

  it('says so while the Studio plays its draft', () => {
    applyTuning({ ...emptyTuning(), revision: 5, savedAt: '2026-01-02T12:00:00Z' });
    setPlayTestLabel('Play test · unsaved draft');
    expect(currentBalanceLabel()).toBe('Play test · unsaved draft');
    setPlayTestLabel(null);
    expect(currentBalanceLabel()).toBe('Balance v5 · 2 Jan 2026');
  });
});
