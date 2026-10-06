import Phaser from 'phaser';
import { CAR_KEYS } from '../art/objects';
import { BALANCE, TILE } from '../config/balance';
import { FIXTURES } from '../config/fixtures';
import { Door } from '../entities/Door';
import { Fixture } from '../entities/Fixture';
import { Grid } from '../systems/Grid';
import type { Point } from '../systems/pathfinding';
import { sortDepth } from '../ui/depth';
import { TILESET_MARGIN, TILESET_SPACING, TILESET_TEXTURE, pickForCell, tileLayers, wallMount, type Mount } from './autotile';
import type { RoomKind } from './legend';
import type { ParsedMap, TileRect } from './mapText';
import { wallGrid } from './validate';

export interface Room {
  name: string;
  kind: RoomKind;
  rect: Phaser.Geom.Rectangle;
}

export interface Van {
  rect: Phaser.Geom.Rectangle;
  reach: Phaser.Geom.Rectangle;
  image: Phaser.GameObjects.Image;
}

// ---- How things stand on the map (shared with the map editor) ------------------------------

/**
 * Stands an image on the floor: its bottom edge on the bottom of the cells it covers, centred,
 * and sorted by that edge so whoever stands lower on screen is drawn in front.
 */
export function standOnFloor<T extends Phaser.GameObjects.Image>(image: T, rect: TileRect): T {
  const bottom = (rect.y + rect.h) * TILE;
  return image.setOrigin(0.5, 1).setPosition((rect.x + rect.w / 2) * TILE, bottom).setDepth(sortDepth(bottom));
}

/** Texture for a decoration: cars get a colour picked by where they are parked. */
export function decorKey(d: { id: string; x: number; y: number }): string {
  return d.id === 'car' ? pickForCell(CAR_KEYS, d.x, d.y, 17) : d.id;
}

/** The van seen from the side for a wide block (4x2), from the front for a tall one (2x4). */
export function vanKey(rect: TileRect): string {
  return rect.w >= rect.h ? 'van' : 'van_tall';
}

/** Which wall a wall-mounted fixture hangs on (front view when it's above, side view left/right). */
export function fixtureMount(map: ParsedMap, x: number, y: number): Mount {
  const wall = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < map.width && cy < map.height && map.walls[cy][cx] >= 0;
  return wallMount(wall, x, y);
}

/** Two tilemap layers (floor, walls) drawing the map with autotiled frames from the generated tileset. */
export function addTileLayers(scene: Phaser.Scene, map: ParsedMap): { floor: Phaser.Tilemaps.TilemapLayer; walls: Phaser.Tilemaps.TilemapLayer } {
  const frames = tileLayers(map);
  const layer = (data: number[][], depth: number) => {
    const tilemap = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tileset = tilemap.addTilesetImage('school', TILESET_TEXTURE, TILE, TILE, TILESET_MARGIN, TILESET_SPACING)!;
    return (tilemap.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer).setDepth(depth);
  };
  return { floor: layer(frames.floor, 0), walls: layer(frames.walls, 1) };
}

/** Builds a playable level from a parsed text map (see src/world/mapText.ts). */
export class World {
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly width: number;
  readonly height: number;
  /** Blocked for walking / pathfinding: walls, solid fixtures, decorations, locked doors, the van. */
  readonly nav: Grid;
  /** Blocks line of sight: walls and closed doors (decorations are see-through). */
  readonly sight: Grid;
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly fixtures: Fixture[] = [];
  readonly doors: Door[] = [];
  /** Plants, trash cans, trees and parked cars. */
  readonly decor: Phaser.GameObjects.Image[] = [];
  readonly rooms: Room[];
  readonly patrol: Point[];
  readonly playerSpawn: Point;
  readonly bossSpawn: Point;
  readonly studentSpawns: Point[];
  readonly van: Van;

  constructor(
    scene: Phaser.Scene,
    readonly map: ParsedMap,
  ) {
    if (!map.player || !map.boss || !map.van) throw new Error('Map needs a player start (P), Mr. Gravy (G) and a van (V)');
    const center = (p: { x: number; y: number }): Point => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });

    const layers = addTileLayers(scene, map);
    this.walls = layers.walls;
    this.walls.setCollisionByExclusion([-1]);
    this.width = map.width * TILE;
    this.height = map.height * TILE;

    this.nav = wallGrid(map);
    this.sight = wallGrid(map);
    this.solids = scene.physics.add.staticGroup();
    const block = (r: TileRect, inset: number) => {
      for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) this.nav.set(tx, ty, true);
      this.solids.add(scene.add.zone((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE, r.w * TILE - inset * 2, r.h * TILE - inset * 2));
    };

    this.rooms = map.rooms.map((r) => ({
      name: r.name,
      kind: r.kind,
      rect: new Phaser.Geom.Rectangle(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE),
    }));
    this.patrol = map.patrol.map(center);
    this.playerSpawn = center(map.player);
    this.bossSpawn = center(map.boss);
    this.studentSpawns = map.students.map(center);

    for (const f of map.fixtures) {
      const def = FIXTURES[f.id];
      if (!def) continue;
      const { x, y } = center(f);
      this.fixtures.push(new Fixture(scene, def, x, y, def.wallMounted ? fixtureMount(map, f.x, f.y) : 'front'));
      if (def.solid) block({ x: f.x, y: f.y, w: 1, h: 1 }, TILE * 0.1);
    }

    for (const d of map.decor) {
      this.decor.push(standOnFloor(scene.add.image(0, 0, decorKey(d)), d));
      // Solid but see-through: blocks walking only.
      block(d, d.w > 1 || d.h > 1 ? 6 : TILE * 0.12);
    }

    for (const d of map.doors) {
      const rect = new Phaser.Geom.Rectangle(d.x * TILE, d.y * TILE, d.w * TILE, d.h * TILE);
      this.doors.push(new Door(scene, this.solids, [this.nav, this.sight], rect, true, BALANCE.doors.unlockSeconds));
    }

    const v = map.van;
    const rect = new Phaser.Geom.Rectangle(v.x * TILE, v.y * TILE, v.w * TILE, v.h * TILE);
    const pad = BALANCE.vanReachTiles * TILE;
    const reach = new Phaser.Geom.Rectangle(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2);
    // Drawn facing the camera, never turned: a side view for a wide block, a front view for a tall one.
    const image = standOnFloor(scene.add.image(0, 0, vanKey(v)), v).setDisplaySize(rect.width, rect.height);
    block(v, 6);
    this.van = { rect, reach, image };
  }

  private roomIndexAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return -1;
    return this.map.roomAt[ty * this.map.width + tx];
  }

  roomAt(x: number, y: number): string {
    return this.rooms[this.roomIndexAt(x, y)]?.name ?? '';
  }

  roomKindAt(x: number, y: number): RoomKind | null {
    return this.rooms[this.roomIndexAt(x, y)]?.kind ?? null;
  }
}
