// The school-wide high alert: after a student's yell reaches Mr. Gravy, word gets around and every
// student watches for Dalton until the timer runs out. Another report restarts it. Pure, so tested.

export class AlertTimer {
  /** Seconds left (0 when off). */
  left = 0;
  /** Seconds it lasted when it was last (re)started, for the HUD's bar. */
  total = 0;

  get active(): boolean {
    return this.left > 0;
  }

  /** Starts it, or restarts it from the top. Returns true if it wasn't on already. */
  start(seconds: number): boolean {
    const fresh = !this.active;
    this.left = this.total = Math.max(0, seconds);
    return fresh && this.active;
  }

  /** Counts down. Returns true on the one frame it runs out. */
  tick(dt: number): boolean {
    if (!this.active) return false;
    this.left = Math.max(0, this.left - dt);
    return this.left === 0;
  }

  stop(): void {
    this.left = 0;
  }

  /** What the HUD shows: null when off. */
  hud(): { left: number; total: number } | null {
    return this.active ? { left: this.left, total: this.total } : null;
  }
}
