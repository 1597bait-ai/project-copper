import { describe, expect, it } from 'vitest';
import { numberWord, timesWord } from './words';

describe('counts in words', () => {
  it('spells out small numbers', () => {
    expect(numberWord(3)).toBe('three');
    expect(numberWord(10)).toBe('ten');
    expect(numberWord(12)).toBe('12');
  });

  it('says how many times', () => {
    expect([1, 2, 3, 11].map(timesWord)).toEqual(['once', 'twice', 'three times', '11 times']);
  });
});
