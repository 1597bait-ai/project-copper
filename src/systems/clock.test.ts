import { describe, expect, it } from 'vitest';
import { clockText, shiftHours } from './clock';

describe('the shift clock', () => {
  it('runs from the start hour to the end hour in 5-minute ticks', () => {
    const shift = { startHour: 7, endHour: 15 };
    expect(clockText(0, shift)).toBe('7:00 AM');
    expect(clockText(0.5, shift)).toBe('11:00 AM');
    expect(clockText(0.51, shift)).toBe('11:00 AM');
    expect(clockText(1, shift)).toBe('3:00 PM');
    expect(clockText(2, shift)).toBe('3:00 PM');
  });

  it('shows midnight as 12:00 AM and noon as 12:00 PM', () => {
    expect(clockText(1, { startHour: 20, endHour: 24 })).toBe('12:00 AM');
    expect(clockText(0, { startHour: 12, endHour: 13 })).toBe('12:00 PM');
    expect(clockText(0, { startHour: 0, endHour: 1 })).toBe('12:00 AM');
  });

  it('never runs backwards: an end at or before the start runs one hour', () => {
    expect(shiftHours({ startHour: 20, endHour: 8 })).toEqual({ start: 20, end: 21 });
    expect(shiftHours({ startHour: 9, endHour: 9 })).toEqual({ start: 9, end: 10 });
    expect(clockText(1, { startHour: 20, endHour: 8 })).toBe('9:00 PM');
    expect(clockText(1, { startHour: 23, endHour: 4 })).toBe('12:00 AM');
  });
});
