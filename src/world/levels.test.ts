// "Level lint": every shipped map must be playable, and the map format must round-trip.
// Runs in CI, so a typo in a map file fails the build instead of shipping.

import { describe, expect, it } from 'vitest';
import { allSprites } from '../art/sprites';
import { CHARACTERS } from '../config/characters';
import { FIXTURES } from '../config/fixtures';
import { MATERIALS } from '../config/materials';
import { NPCS } from '../config/npcs';
// @ts-expect-error -- plain JS module shared with the art tool
import { TILES as ART_TILES } from '../../tools/tiles.mjs';
import { FIXTURE_CHARS, TILES } from './legend';
import { parseMap, serializeMap } from './mapText';
import { MAPS } from './maps';
import { validateMap, walkGrid } from './validate';

const spriteKeys = new Set(allSprites().map((s) => s.key));

describe('content', () => {
  it('every fixture, character and NPC has art', () => {
    for (const id of Object.keys(FIXTURES)) expect(spriteKeys.has(id), `sprite for fixture ${id}`).toBe(true);
    for (const c of Object.values(CHARACTERS)) expect(spriteKeys.has(c.sprite), `sprite for ${c.id}`).toBe(true);
    for (const n of Object.values(NPCS)) {
      for (const key of [n.sprite, ...(n.variants ?? [])]) expect(spriteKeys.has(key), `sprite ${key} for ${n.id}`).toBe(true);
    }
  });

  it('every fixture has a map character', () => {
    const mapped = new Set(Object.values(FIXTURE_CHARS));
    for (const id of Object.keys(FIXTURES)) expect(mapped.has(id), `map character for ${id}`).toBe(true);
  });

  it('the tile legend matches the tileset art, in order', () => {
    expect((ART_TILES as { char: string }[]).map((t) => t.char)).toEqual(TILES.map((t) => t.char));
  });
});

for (const entry of MAPS) {
  describe(`map ${entry.key}`, () => {
    const map = parseMap(entry.text);

    it('is playable (spawns, van, route, everything reachable)', () => {
      const { errors } = validateMap(map);
      expect(errors).toEqual([]);
    });

    it('is square', () => {
      expect(map.width).toBe(map.height);
    });

    it('round-trips through the editor format', () => {
      const again = parseMap(serializeMap(map.rows, map.names));
      expect(again.rows).toEqual(map.rows);
      expect(again.rooms.map((r) => r.name)).toEqual(map.rooms.map((r) => r.name));
    });

    it('pays more the deeper you go (walking distance from the van vs price per unit)', () => {
      // Walking distance (in steps) from the tiles around the van, with every door unlocked.
      const grid = walkGrid(map);
      const dist = new Int32Array(map.width * map.height).fill(-1);
      const queue: { x: number; y: number }[] = [];
      const v = map.van!;
      for (let y = v.y - 1; y <= v.y + v.h; y++) {
        for (let x = v.x - 1; x <= v.x + v.w; x++) {
          if (!grid.blocked(x, y)) {
            dist[y * map.width + x] = 0;
            queue.push({ x, y });
          }
        }
      }
      for (let i = 0; i < queue.length; i++) {
        const c = queue[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (grid.blocked(nx, ny) || dist[ny * map.width + nx] >= 0) continue;
          dist[ny * map.width + nx] = dist[c.y * map.width + c.x] + 1;
          queue.push({ x: nx, y: ny });
        }
      }
      const steps = (f: { x: number; y: number }) =>
        Math.min(...[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => dist[(f.y + dy) * map.width + f.x + dx]).filter((d) => d >= 0));
      const price = (f: { id: string }) => MATERIALS[FIXTURES[f.id].material].pricePerUnit;
      const loot = map.fixtures.map((f) => ({ ...f, steps: steps(f), price: price(f) }));
      const avgSteps = (fs: typeof loot) => fs.reduce((n, f) => n + f.steps, 0) / fs.length;
      const best = Math.max(...loot.map((f) => f.price));
      const top = loot.filter((f) => f.price === best);
      const rest = loot.filter((f) => f.price < best);
      // The top-priced loot is far deeper than everything else, on average and one by one.
      expect(avgSteps(top)).toBeGreaterThan(avgSteps(rest) * 1.5);
      for (const f of top) expect(f.steps, `${f.id} at ${f.x},${f.y}`).toBeGreaterThan(map.height * 0.7);
      // Right by the van there is only cheap stuff (nothing copper within 12 steps).
      for (const f of loot.filter((f) => f.steps <= 12)) expect(f.price, `${f.id} at ${f.x},${f.y}`).toBeLessThan(MATERIALS.copper.pricePerUnit);
    });
  });
}
