import { describe, expect, it } from 'vitest';
import { UI_ICONS, uiArt, uiPix } from './ui';

describe('UI icons', () => {
  it('draws every icon it lists, as small square-ish pixel art', () => {
    const pix = uiPix();
    expect(Object.keys(pix).sort()).toEqual([...uiArt.keys()].sort());
    for (const key of Object.values(UI_ICONS)) {
      expect(pix[key].empty, key).toBe(false);
      expect(pix[key].w, key).toBeLessThanOrEqual(16);
      expect(pix[key].h, key).toBeLessThanOrEqual(16);
    }
  });

  it('icons have a transparent background (corners clear)', () => {
    for (const [key, p] of Object.entries(uiPix())) expect(p.get(0, 0), key).toBe(0);
  });
});
