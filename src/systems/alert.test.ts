import { describe, expect, it } from 'vitest';
import { AlertTimer } from './alert';

describe('high alert timer', () => {
  it('is off until started', () => {
    const a = new AlertTimer();
    expect(a.active).toBe(false);
    expect(a.hud()).toBeNull();
    expect(a.tick(1)).toBe(false);
  });

  it('counts down and reports the frame it ends, once', () => {
    const a = new AlertTimer();
    expect(a.start(2)).toBe(true);
    expect(a.hud()).toEqual({ left: 2, total: 2 });
    expect(a.tick(1.5)).toBe(false);
    expect(a.hud()).toEqual({ left: 0.5, total: 2 });
    expect(a.tick(1)).toBe(true);
    expect(a.active).toBe(false);
    expect(a.tick(1)).toBe(false);
    expect(a.hud()).toBeNull();
  });

  it('restarts from the top on another report, without counting as a new alert', () => {
    const a = new AlertTimer();
    a.start(45);
    a.tick(40);
    expect(a.start(45)).toBe(false);
    expect(a.left).toBe(45);
    expect(a.tick(44)).toBe(false);
  });

  it('can be stopped', () => {
    const a = new AlertTimer();
    a.start(10);
    a.stop();
    expect(a.active).toBe(false);
    expect(a.start(0)).toBe(false);
  });
});
