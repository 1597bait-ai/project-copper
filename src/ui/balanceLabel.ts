// The small "Balance v3 · 12 Oct 2026" label on the menu and the end-of-shift screen, so testers
// can say which balance they played when they report something. Shipped values (v0) show nothing.

import { activeTuning } from '../config/tuning';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Oct 2026" (local date) from an ISO time, or '' when it isn't one. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Balance v3 · 12 Oct 2026", or null for the shipped values. */
export function balanceLabel(file: { revision: number; savedAt: string | null }): string | null {
  if (!(file.revision > 0)) return null;
  const date = shortDate(file.savedAt);
  return date ? `Balance v${file.revision} · ${date}` : `Balance v${file.revision}`;
}

let playTest: string | null = null;

/** While Copper Studio plays its unsaved draft, the label says so instead (null when it stops). */
export function setPlayTestLabel(text: string | null): void {
  playTest = text;
}

/** True while Copper Studio plays its draft: such a shift doesn't count toward the player's own progress. */
export function isPlayTest(): boolean {
  return playTest !== null;
}

/** The label to show now, or null. */
export function currentBalanceLabel(): string | null {
  return playTest ?? balanceLabel(activeTuning());
}
