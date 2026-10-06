import { describe, expect, it } from 'vitest';
import {
  FLOOR_VARIANTS,
  TILE_FRAMES,
  cellHash,
  floorFrameAt,
  floorVariant,
  frameIndex,
  frameName,
  frameRect,
  iconFrame,
  pickForCell,
  tileLayers,
  wallFrameAt,
  wallMount,
  TILESET_COLUMNS,
} from './autotile';
import { TILES } from './legend';
import { parseMap } from './mapText';

const grid = (...rows: string[]) => parseMap(rows.join('\n'));

describe('tileset frames', () => {
  it('every frame has a unique name and an index', () => {
    const names = TILE_FRAMES.map(frameName);
    expect(new Set(names).size).toBe(names.length);
    TILE_FRAMES.forEach((f, i) => expect(frameIndex(f)).toBe(i));
  });

  it('every tile in the legend has frames and a palette icon', () => {
    for (const t of TILES) {
      expect(TILE_FRAMES.some((f) => f.char === t.char), t.name).toBe(true);
      expect(iconFrame(t.char)).toBeGreaterThanOrEqual(0);
    }
  });

  it('frames sit in a padded grid', () => {
    const a = frameRect(0);
    const b = frameRect(1);
    const below = frameRect(TILESET_COLUMNS);
    expect(a.w).toBe(64);
    expect(b.x - a.x).toBe(64 + 8);
    expect(below.y - a.y).toBe(64 + 8);
    expect(a.x).toBe(4);
  });
});

describe('walls', () => {
  it('show their front when the cell below is not a wall, their top when it is', () => {
    const map = grid('.....', '.###.', '.###.', '.....');
    expect(wallFrameAt(map, 2, 1)?.part).toBe('top');
    expect(wallFrameAt(map, 2, 2)?.part).toBe('face');
    expect(wallFrameAt(map, 0, 0)).toBeNull();
  });

  it('draw edges where the wall ends', () => {
    const map = grid('.....', '.###.', '.....');
    const left = wallFrameAt(map, 1, 1)!;
    const mid = wallFrameAt(map, 2, 1)!;
    expect([left.openTop, left.left, left.right]).toEqual([true, 'open', 'closed']);
    expect([mid.left, mid.right]).toEqual(['closed', 'closed']);
    expect(wallFrameAt(map, 3, 1)!.right).toBe('open');
  });

  it('a wall running down the screen is caps with a front at its bottom end', () => {
    const map = grid('.#.', '.#.', '.#.', '...');
    expect([0, 1, 2].map((y) => wallFrameAt(map, 1, y)!.part)).toEqual(['top', 'top', 'face']);
    expect(wallFrameAt(map, 1, 1)!.left).toBe('open');
  });

  it('a cap next to a wall front gets its side edge (T junction)', () => {
    const map = grid('#####', '..#..', '..#..');
    const cap = wallFrameAt(map, 2, 0)!;
    expect(cap.part).toBe('top');
    expect([cap.left, cap.right]).toEqual(['face', 'face']);
    expect(wallFrameAt(map, 1, 0)!.part).toBe('face');
  });

  it('marks inner corners', () => {
    const map = grid('.#..', '###.', '###.');
    const f = wallFrameAt(map, 1, 1)!;
    expect(f.openTop).toBe(false);
    expect(f.cornerLeft).toBe(true);
    expect(f.cornerRight).toBe(true);
  });

  it('different solid walls join; fences stand apart from them', () => {
    const map = grid('.....', '.#WB.', '.FF..', '.....');
    expect(wallFrameAt(map, 2, 1)!.left).toBe('closed');
    expect(wallFrameAt(map, 3, 1)!.left).toBe('closed');
    // The brick wall ends at the fence below it (shows its front), the fence joins up to it.
    expect(wallFrameAt(map, 2, 1)!.part).toBe('face');
    expect(wallFrameAt(map, 2, 2)!.openTop).toBe(false);
  });

  it('every wall cell of every possible neighbourhood has a frame', () => {
    // All 2^9 3x3 patterns of wall / floor around a centre wall, for each wall type.
    for (const t of TILES.filter((d) => d.layer === 'walls')) {
      for (let m = 0; m < 512; m++) {
        if (!(m & 16)) continue;
        const rows = [0, 1, 2].map((y) => [0, 1, 2].map((x) => (m & (1 << (y * 3 + x)) ? t.char : '.')).join(''));
        const map = grid(...rows);
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (rows[y][x] !== '.') expect(tileLayers(map).walls[y][x], `${t.char} ${rows.join('/')}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('floors', () => {
  it('get a shadow under and beside solid walls', () => {
    const map = grid('###', '#..', '#..');
    expect(floorFrameAt(map, 1, 1)).toMatchObject({ shadeTop: true, shadeLeft: true });
    expect(floorFrameAt(map, 2, 2)).toMatchObject({ shadeTop: false, shadeLeft: false });
    expect(floorFrameAt(map, 0, 0)).toBeNull();
  });

  it('draws the floor beside a fence under it, without shadows', () => {
    const map = grid('FFF', 'ggg', 'ppp');
    expect(floorFrameAt(map, 1, 0)).toMatchObject({ char: 'g', shadeTop: false });
    expect(floorFrameAt(map, 1, 1)!.shadeTop).toBe(false);
  });

  it('objects stand on the floor around them', () => {
    const map = grid(',,,', ',d,', ',,,');
    expect(floorFrameAt(map, 1, 1)!.char).toBe(',');
  });

  it('picks versions the same way every time, mostly the plain one', () => {
    let plain = 0;
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const v = floorVariant('g', x, y);
        expect(v).toBe(floorVariant('g', x, y));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(FLOOR_VARIANTS.g.count);
        if (v === 0) plain++;
      }
    }
    expect(plain / 1600).toBeGreaterThan(0.3);
    expect(plain / 1600).toBeLessThan(0.6);
    expect(floorVariant('n', 3, 4)).toBe(0);
  });

  it('parking lines end where the line stops', () => {
    const map = grid('ppp', 'p|p', 'p|p', 'ppp', 'p|p');
    expect(floorFrameAt(map, 1, 1)!.variant).toBe(1);
    expect(floorFrameAt(map, 1, 2)!.variant).toBe(2);
    expect(floorFrameAt(map, 1, 4)!.variant).toBe(3);
  });
});

describe('placement helpers', () => {
  it('wall-mounted fixtures hang on the wall above, else left, else right', () => {
    const wallAt = (walls: string[]) => (x: number, y: number) => walls.includes(`${x},${y}`);
    expect(wallMount(wallAt(['1,0', '0,1']), 1, 1)).toBe('front');
    expect(wallMount(wallAt(['0,1']), 1, 1)).toBe('left');
    expect(wallMount(wallAt(['2,1']), 1, 1)).toBe('right');
    expect(wallMount(wallAt([]), 1, 1)).toBe('front');
  });

  it('cell hashes are stable and spread out', () => {
    expect(cellHash(3, 4)).toBe(cellHash(3, 4));
    expect(cellHash(3, 4)).not.toBe(cellHash(4, 3));
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) picks.add(pickForCell(['a', 'b', 'c', 'd'], i, i * 3));
    expect(picks.size).toBe(4);
  });
});
