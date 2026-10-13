import { BALANCE } from '../config/balance';

type ShiftHours = { startHour: number; endHour: number };

/**
 * The hours the shift clock runs between. Copper Studio lets any pair through, and an end at or
 * before the start would run the clock backwards: it then runs for one hour.
 */
export function shiftHours(shift: ShiftHours = BALANCE.shift): { start: number; end: number } {
  return { start: shift.startHour, end: Math.max(shift.endHour, shift.startHour + 1) };
}

/** Shift progress 0..1 -> "7:00 AM" style clock text (for `shift`'s hours, the live ones by default). */
export function clockText(progress: number, shift: ShiftHours = BALANCE.shift): string {
  const { start, end } = shiftHours(shift);
  const totalMinutes = Math.floor((start + (end - start) * Math.min(1, Math.max(0, progress))) * 60);
  // Snap to 5-minute steps so the clock ticks like a wall clock instead of flickering.
  const snapped = totalMinutes - (totalMinutes % 5);
  // Hour 24 is midnight: 12:00 AM.
  const h24 = Math.floor(snapped / 60) % 24;
  const m = snapped % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
