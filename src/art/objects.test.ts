import { describe, expect, it } from 'vitest';
import { DECOR } from '../config/decor';
import { FIXTURES } from '../config/fixtures';
import { CAR_KEYS, RECHARGE_FRAMES, objectArt, objectPix, rechargeFrames } from './objects';

describe('object art', () => {
  const all = objectPix();

  it('draws every fixture and decoration, and a side view for every wall-mounted fixture', () => {
    for (const def of Object.values(FIXTURES)) {
      expect(all[def.id]?.empty, def.id).toBe(false);
      if (def.wallMounted) expect(all[`${def.id}_side`]?.empty, `${def.id}_side`).toBe(false);
    }
    for (const id of Object.keys(DECOR)) expect(all[id]?.empty, id).toBe(false);
    for (const key of CAR_KEYS) expect(all[key]?.empty, key).toBe(false);
    expect(CAR_KEYS[0]).toBe('car');
  });

  it('draws the van both ways and every door', () => {
    expect([all.van.w, all.van.h]).toEqual([64, 32]);
    expect([all.van_tall.w, all.van_tall.h]).toEqual([32, 64]);
    for (const state of ['locked', 'open']) {
      expect([all[`door_${state}`].w, all[`door_${state}`].h]).toEqual([32, 16]);
      expect([all[`door_${state}_1`].w, all[`door_${state}_1`].h]).toEqual([16, 16]);
      expect([all[`door_${state}_v`].w, all[`door_${state}_v`].h]).toEqual([16, 32]);
      expect([all[`door_${state}_v1`].w, all[`door_${state}_v1`].h]).toEqual([16, 16]);
    }
  });

  it('fixtures are one tile wide and stand on their tile (taller ones reach up over the wall)', () => {
    for (const def of Object.values(FIXTURES)) {
      const p = all[def.id];
      // Mr. Gravy's truck goes on the map as a block (src/config/decor.ts): as wide as that.
      expect(p.w, def.id).toBe(16 * (def.gravyTruck ? DECOR[def.id].w : 1));
      expect(p.h, def.id).toBeGreaterThanOrEqual(16);
    }
  });

  it('big decorations cover their footprint (2x2 boiler, 2x1 generator, cars)', () => {
    for (const def of Object.values(DECOR)) {
      if (def.w * def.h === 1) continue;
      const p = all[def.id];
      expect(p.w, def.id).toBe(def.w * 16);
      expect(p.h, def.id).toBeGreaterThanOrEqual(def.h * 16);
    }
  });

  it('draws the recharge clock as a light face that fills up green, never a dark disc', () => {
    const frames = rechargeFrames();
    expect(frames).toHaveLength(RECHARGE_FRAMES + 1);
    const count = (p: (typeof frames)[number], rgb: number) => Array.from(p.data).filter((v) => v !== 0 && (v & 0xffffff) === rgb).length;
    const light = (p: (typeof frames)[number]) =>
      Array.from(p.data).filter((v) => {
        if (v === 0) return false;
        const lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
        return lum > 200;
      }).length;
    const green = frames.map((p) => count(p, 0x7ddc7d));
    expect(green[0]).toBe(0);
    expect(light(frames[0])).toBeGreaterThan(25); // most of the face
    for (let i = 1; i < frames.length; i++) expect(green[i], `frame ${i}`).toBeGreaterThan(green[i - 1]);
    expect(light(frames[RECHARGE_FRAMES])).toBe(0);
  });

  it('lists every key it paints', () => {
    const keys = new Set(objectArt.keys());
    for (const key of Object.keys(all)) expect(keys.has(key), key).toBe(true);
    expect(keys.has('van_big')).toBe(true);
    expect(keys.has('recharge')).toBe(true);
  });
});
