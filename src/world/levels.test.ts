// "Level lint": every shipped map must be playable, and the map format must round-trip.
// Runs in CI, so a typo in a map file fails the build instead of shipping.

import { describe, expect, it } from 'vitest';
import { allSprites } from '../art/sprites';
import { CHARACTERS } from '../config/characters';
import { FIXTURES } from '../config/fixtures';
import { NPCS } from '../config/npcs';
// @ts-expect-error -- plain JS module shared with the art tool
import { TILES as ART_TILES } from '../../tools/tiles.mjs';
import { FIXTURE_CHARS, TILES } from './legend';
import { parseMap, serializeMap } from './mapText';
import { MAPS } from './maps';
import { validateMap } from './validate';

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

    it('keeps the best loot deepest (farther from the van = more copper)', () => {
      const van = map.van!;
      const vanY = van.y;
      const depth = (y: number) => vanY - y;
      const copperDepths = map.fixtures.filter((f) => FIXTURES[f.id].material === 'copper').map((f) => depth(f.y));
      const steelDepths = map.fixtures.filter((f) => FIXTURES[f.id].material === 'steel').map((f) => depth(f.y));
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(avg(copperDepths)).toBeGreaterThan(avg(steelDepths));
      // The richest single source (the copper piles) are all in the back half of the building.
      const piles = map.fixtures.filter((f) => f.id === 'abandoned_copper_pile');
      for (const p of piles) expect(depth(p.y), `copper pile at ${p.x},${p.y}`).toBeGreaterThan(map.height / 2);
    });
  });
}
