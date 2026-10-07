import { describe, expect, it } from 'vitest';
import { Controls, oncePerKeyEvent } from './Controls';

describe('oncePerKeyEvent', () => {
  it('handles each key event once, even when Phaser replays it', () => {
    const handled: string[] = [];
    const onKey = oncePerKeyEvent((e: { key: string }) => handled.push(e.key));
    const right = { key: 'ArrowRight' };
    const left = { key: 'ArrowLeft' };
    // Phaser re-sends the queued ArrowRight when ArrowLeft arrives in the same frame.
    onKey(right);
    onKey(right);
    onKey(left);
    expect(handled).toEqual(['ArrowRight', 'ArrowLeft']);
  });

  it('still handles a new press of the same key', () => {
    let count = 0;
    const onKey = oncePerKeyEvent(() => count++);
    onKey({ key: 'e' });
    onKey({ key: 'e' });
    expect(count).toBe(2);
  });
});

describe('Controls', () => {
  it('a press is consumed once', () => {
    const c = new Controls();
    c.press('action');
    expect(c.consume('action')).toBe(true);
    expect(c.consume('action')).toBe(false);
  });
});
