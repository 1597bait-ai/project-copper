import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../config/characters';
import { NPCS } from '../config/npcs';
import { LOOKS, characterArt, characterFrames, characterPortrait, sackPix, shadowPix, templateProblems } from './characters';
import type { Pix } from './pixel';

const INK = 0x283040;
const FACINGS = ['down', 'up', 'left', 'right'];

/** Lowest row with anything drawn. */
function bottomRow(p: Pix): number {
  for (let y = p.h - 1; y >= 0; y--) for (let x = 0; x < p.w; x++) if (p.get(x, y) !== 0) return y;
  return -1;
}

/** Pixels on the image border that aren't outline (the outline would have been cut off there). */
function cutAtEdge(p: Pix): number {
  let n = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (x > 0 && y > 0 && x < p.w - 1 && y < p.h - 1) continue;
      const v = p.get(x, y);
      if (v !== 0 && (v & 0xffffff) !== INK) n++;
    }
  }
  return n;
}

describe('character art', () => {
  it('templates are all 16 wide and bodies end above the bottom outline', () => {
    expect(templateProblems()).toEqual([]);
  });

  it('every crew member, disguise and NPC has a look', () => {
    for (const c of Object.values(CHARACTERS)) expect(LOOKS[c.sprite], c.id).toBeDefined();
    expect(LOOKS.dalton_disguise).toBeDefined();
    for (const n of Object.values(NPCS)) for (const key of [n.sprite, ...(n.variants ?? [])]) expect(LOOKS[key], key).toBeDefined();
  });

  it('lists the sheet, standing image and portrait of every look', () => {
    const keys = new Set(characterArt.keys());
    for (const k of Object.keys(LOOKS)) for (const key of [k, `${k}_sheet`, `${k}_big`]) expect(keys.has(key), key).toBe(true);
    expect(keys.has('shadow') && keys.has('sack')).toBe(true);
  });

  for (const [key, look] of Object.entries(LOOKS)) {
    it(`${key}: every frame, same size, feet planted, nothing cut off`, () => {
      const frames = characterFrames(look);
      const names = frames.map((f) => f.name);
      for (const f of FACINGS) {
        for (const i of [0, 1, 2]) expect(names, `${f}-${i}`).toContain(`${f}-${i}`);
        expect(names).toContain(`${f}-yell`);
        expect(names).toContain(`${f}-work-0`);
        expect(names).toContain(`${f}-work-1`);
      }
      if (look.sleeps) expect(names).toEqual(expect.arrayContaining(['sleep-0', 'sleep-1']));
      const { w, h } = frames[0].pix;
      for (const f of frames) {
        expect([f.pix.w, f.pix.h], f.name).toEqual([w, h]);
        expect(f.pix.empty, f.name).toBe(false);
        expect(bottomRow(f.pix), `${f.name} stands on the bottom row`).toBe(h - 1);
        expect(cutAtEdge(f.pix), `${f.name} touches the frame edge`).toBe(0);
      }
      // Left is right mirrored.
      const right = frames.find((f) => f.name === 'right-1')!.pix;
      const left = frames.find((f) => f.name === 'left-1')!.pix;
      expect(Array.from(left.flipX().data)).toEqual(Array.from(right.data));
    });
  }

  it('sizes people by build: kids smaller, Mr. Gravy bigger', () => {
    const size = (k: string) => characterFrames(LOOKS[k])[0].pix;
    expect([size('dalton').w, size('dalton').h]).toEqual([16, 24]);
    expect(size('student').h).toBeLessThan(24);
    expect(size('mr_gravy').w).toBeGreaterThan(16);
    expect(size('mr_gravy').h).toBeGreaterThan(24);
  });

  it('portraits are 48x48 busts; shadow and sack are drawn', () => {
    for (const look of Object.values(LOOKS)) {
      const p = characterPortrait(look);
      expect([p.w, p.h]).toEqual([48, 48]);
      expect(cutAtEdge(p)).toBeLessThan(48 * 2); // the bust is cut off at the bottom on purpose
    }
    expect(shadowPix().empty).toBe(false);
    expect(sackPix().empty).toBe(false);
  });

  it('builds the same pixels every time', () => {
    const a = characterFrames(LOOKS.student_b).map((f) => Array.from(f.pix.data).join());
    const b = characterFrames(LOOKS.student_b).map((f) => Array.from(f.pix.data).join());
    expect(a).toEqual(b);
  });
});
