// One place where keyboard, gamepad and touch input meet. Game logic only ever asks
// "which way am I moving?" and "was action / ability / pause pressed?".

export type Press = 'action' | 'ability' | 'pause';

export class Controls {
  /** Analog stick from the on-screen joystick (-1..1). */
  touchMove = { x: 0, y: 0 };
  private presses = new Set<Press>();

  press(p: Press): void {
    this.presses.add(p);
  }

  consume(p: Press): boolean {
    const had = this.presses.has(p);
    this.presses.delete(p);
    return had;
  }

  reset(): void {
    this.presses.clear();
    this.touchMove = { x: 0, y: 0 };
  }
}

/** Shared instance: the HUD's touch controls write to it, the game scene reads it. */
export const controls = new Controls();
