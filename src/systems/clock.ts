import { BALANCE } from '../config/balance';

/** Shift progress 0..1 -> "7:00 AM" style clock text. */
export function clockText(progress: number): string {
  const { startHour, endHour } = BALANCE.shift;
  const totalMinutes = Math.floor((startHour + (endHour - startHour) * Math.min(1, Math.max(0, progress))) * 60);
  // Snap to 5-minute steps so the clock ticks like a wall clock instead of flickering.
  const snapped = totalMinutes - (totalMinutes % 5);
  const h24 = Math.floor(snapped / 60);
  const m = snapped % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
