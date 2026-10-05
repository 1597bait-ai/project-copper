// "Level lint": every map in MAPS must be playable. Runs in CI so a typo in Tiled
// (or a fixture walled off by mistake) fails the build instead of shipping.

import { describe, expect, it } from 'vitest';
import { allSprites } from '../art/sprites';
import { CHARACTERS } from '../config/characters';
import { FIXTURES } from '../config/fixtures';
import { NPCS } from '../config/npcs';
import { Grid } from '../systems/Grid';
import { findPath } from '../systems/pathfinding';
import { MAPS } from './maps';

interface TiledProp {
  name: string;
  value: unknown;
}
interface TiledObj {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  polyline?: { x: number; y: number }[];
}
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  layers: { name: string; type: string; data?: number[]; objects?: TiledObj[] }[];
  tilesets: { firstgid: number; tiles?: { id: number; properties?: TiledProp[] }[] }[];
}

const spriteKeys = new Set(allSprites().map((s) => s.key));

describe('content', () => {
  it('every fixture, character and NPC has art', () => {
    for (const id of Object.keys(FIXTURES)) expect(spriteKeys.has(id), `sprite for fixture ${id}`).toBe(true);
    for (const c of Object.values(CHARACTERS)) expect(spriteKeys.has(c.sprite), `sprite for ${c.id}`).toBe(true);
    for (const n of Object.values(NPCS)) expect(spriteKeys.has(n.sprite), `sprite for ${n.id}`).toBe(true);
  });
});

for (const entry of MAPS) {
  describe(`map ${entry.key}`, () => {
    const map = entry.data as TiledMap;
    const T = map.tilewidth;
    const objects = map.layers.find((l) => l.name === 'objects')?.objects ?? [];
    const walls = map.layers.find((l) => l.name === 'walls')!;

    // Walkable grid: walls block; solid fixtures and the van block; doors count as open (they can be unlocked).
    const collides = new Set<number>();
    for (const ts of map.tilesets) {
      for (const t of ts.tiles ?? []) {
        if (t.properties?.some((p) => p.name === 'collides' && p.value === true)) collides.add(ts.firstgid + t.id);
      }
    }
    const grid = new Grid(map.width, map.height, T);
    walls.data!.forEach((gid, i) => grid.set(i % map.width, Math.floor(i / map.width), collides.has(gid)));
    const tileOf = (x: number, y: number) => ({ tx: Math.floor(x / T), ty: Math.floor(y / T) });
    for (const o of objects) {
      if (o.type === 'fixture' && FIXTURES[o.name]?.solid) {
        const { tx, ty } = tileOf(o.x, o.y);
        grid.set(tx, ty, true);
      }
      if (o.type === 'van') {
        for (let x = o.x; x < o.x + o.width; x += T) for (let y = o.y; y < o.y + o.height; y += T) grid.set(x / T, y / T, true);
      }
    }

    const one = (type: string) => objects.filter((o) => o.type === type);
    const player = one('player_spawn')[0];
    const reachable = (x: number, y: number) => {
      const from = tileOf(player.x, player.y);
      const to = tileOf(x, y);
      // Solid things are reached from a neighbouring tile.
      const goals = grid.blocked(to.tx, to.ty)
        ? [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].map(([dx, dy]) => ({ tx: to.tx + dx, ty: to.ty + dy }))
        : [to];
      return goals.some((g) => !grid.blocked(g.tx, g.ty) && findPath(grid, from.tx, from.ty, g.tx, g.ty) !== null);
    };

    it('has exactly one player spawn, boss spawn and van', () => {
      expect(one('player_spawn')).toHaveLength(1);
      expect(one('boss_spawn')).toHaveLength(1);
      expect(one('van')).toHaveLength(1);
    });

    it('only uses known fixtures', () => {
      for (const f of one('fixture')) expect(FIXTURES[f.name], `unknown fixture "${f.name}"`).toBeDefined();
    });

    it('can reach the van and every fixture from the spawn', () => {
      const van = one('van')[0];
      expect(reachable(van.x + van.width / 2, van.y + van.height / 2)).toBe(true);
      for (const f of one('fixture')) expect(reachable(f.x, f.y), `${f.name} at ${f.x},${f.y}`).toBe(true);
    });

    it('has a walkable boss patrol', () => {
      const patrol = one('patrol')[0];
      expect(patrol?.polyline?.length ?? 0).toBeGreaterThanOrEqual(2);
      for (const p of patrol.polyline!) {
        const { tx, ty } = tileOf(patrol.x + p.x, patrol.y + p.y);
        expect(grid.blocked(tx, ty), `patrol point ${tx},${ty}`).toBe(false);
        expect(reachable(patrol.x + p.x, patrol.y + p.y)).toBe(true);
      }
    });
  });
}
