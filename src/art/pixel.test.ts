import { describe, expect, it } from 'vitest';
import { Pix, alpha, fromRows, mix, rng } from './pixel';

describe('Pix', () => {
  it('draws, outlines and mirrors', () => {
    const p = fromRows(['.a.', 'aaa'], { a: 0xff0000 });
    expect(p.w).toBe(3);
    expect(p.get(1, 0)).toBe(0xffff0000);
    expect(p.get(0, 0)).toBe(0);
    const o = new Pix(5, 4).draw(p, 1, 1).outline(0x000000);
    expect(o.get(2, 0)).toBe(0xff000000); // above the top pixel
    expect(o.get(0, 2)).toBe(0xff000000);
    expect(o.get(0, 0)).toBe(0); // corners are not outlined
    const lop = fromRows(['ab'], { a: 1, b: 2 }).flipX();
    expect([lop.get(0, 0) & 0xffffff, lop.get(1, 0) & 0xffffff]).toEqual([2, 1]);
  });

  it('blends see-through colours and ignores pixels off the image', () => {
    const p = new Pix(2, 1).set(0, 0, 0xffffff).set(0, 0, alpha(0x000000, 0.5)).set(5, 5, 0x123456);
    expect(p.get(0, 0) & 0xffffff).toBe(mix(0xffffff, 0x000000, 128 / 255));
    expect(p.get(0, 0) >>> 24).toBe(255);
    expect(alpha(0x123456, 0)).toBeNull();
  });

  it('random numbers repeat for the same seed', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
