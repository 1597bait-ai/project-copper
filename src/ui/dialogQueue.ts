// What the HUD's dialog box shows, and when. Pure logic (no Phaser), so it's unit tested.
//
// One line at a time, typed out letter by letter. A line stays up for its `seconds` (longer
// if it takes longer to type and read). A tap / the action key finishes the typing, a second
// one closes it. A line that arrives while another is up waits its turn, unless the one on
// screen has been readable for a moment: then the new one replaces it straight away, so the
// box never lags far behind what's happening.

import type { DialogLine } from '../scenes/GameScene';

export const DIALOG = {
  /** Typewriter speed. */
  charsPerSecond: 40,
  /** A fully typed line stays at least this long (seconds). */
  minReadSeconds: 1.2,
  /** A new line replaces a fully typed one that has been up this long. */
  replaceAfterSeconds: 1,
  /** Lines waiting beyond this many: the oldest waiting one is dropped. */
  maxWaiting: 3,
};

export interface DialogView {
  line: DialogLine;
  /** How many characters of the text are typed so far. */
  chars: number;
  /** Fully typed (show the blinking ▼). */
  typed: boolean;
}

interface Showing {
  line: DialogLine;
  start: number;
  /** When typing finished early (tap), else null. */
  skippedAt: number | null;
  closeAt: number;
}

export class DialogQueue {
  private showing: Showing | null = null;
  private waiting: DialogLine[] = [];

  /** Adds a line at time `now` (seconds). */
  push(line: DialogLine, now: number): void {
    const same = (l: DialogLine) => l.speaker === line.speaker && l.text === line.text;
    if ((this.showing && same(this.showing.line)) || this.waiting.some(same)) return;
    const cur = this.showing;
    if (!cur || (!this.waiting.length && now - this.typedAt(cur) >= DIALOG.replaceAfterSeconds)) {
      this.start(line, now);
      return;
    }
    this.waiting.push(line);
    if (this.waiting.length > DIALOG.maxWaiting) this.waiting.shift();
  }

  /** What to show at time `now` (null: the box is closed). Moves on to the next line when one ends. */
  update(now: number): DialogView | null {
    if (this.showing && now >= this.showing.closeAt) this.next(now);
    const cur = this.showing;
    if (!cur) return null;
    const len = cur.line.text.length;
    const chars = cur.skippedAt !== null ? len : Math.min(len, Math.floor((now - cur.start) * DIALOG.charsPerSecond));
    return { line: cur.line, chars, typed: chars >= len };
  }

  /** A tap or the action key: finish typing, or (when typed) close the line. */
  advance(now: number): void {
    const cur = this.showing;
    if (!cur) return;
    if (this.typedAt(cur) > now) {
      cur.skippedAt = now;
      cur.closeAt = Math.max(cur.closeAt, now + DIALOG.minReadSeconds);
    } else {
      this.next(now);
    }
  }

  get open(): boolean {
    return this.showing !== null;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  clear(): void {
    this.showing = null;
    this.waiting = [];
  }

  private start(line: DialogLine, now: number) {
    const typeSeconds = line.text.length / DIALOG.charsPerSecond;
    this.showing = { line, start: now, skippedAt: null, closeAt: now + Math.max(line.seconds, typeSeconds + DIALOG.minReadSeconds) };
  }

  private next(now: number) {
    const line = this.waiting.shift();
    if (line) this.start(line, now);
    else this.showing = null;
  }

  /** When the line finished (or will finish) typing. */
  private typedAt(s: Showing): number {
    if (s.skippedAt !== null) return s.skippedAt;
    return s.start + s.line.text.length / DIALOG.charsPerSecond;
  }
}
