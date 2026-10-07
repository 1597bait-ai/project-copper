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

/**
 * Wraps a Phaser keyboard handler so it runs once per key press. Phaser only clears its queue of
 * key events after each frame and replays the whole queue whenever another key event arrives, so
 * when three key events land in one frame (a quick tap and the next key, at a low frame rate) the
 * first one is handled again: a menu skips a card, E starts and then cancels a scrap. The replay
 * passes the same event object, so remembering the objects already seen is enough.
 */
export function oncePerKeyEvent<E extends object>(handler: (e: E) => void): (e: E) => void {
  const seen = new WeakSet<E>();
  return (e) => {
    if (seen.has(e)) return;
    seen.add(e);
    handler(e);
  };
}
