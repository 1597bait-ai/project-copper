import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { FIXTURES } from '../config/fixtures';
import { Door } from '../entities/Door';
import { Fixture } from '../entities/Fixture';
import { Grid } from '../systems/Grid';
import type { Point } from '../systems/pathfinding';
import { TILES, type RoomKind } from './legend';
import type { ParsedMap } from './mapText';
import { TILESET_TEXTURE } from './maps';
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

/** Tile indexes that block movement and sight. */
const COLLIDING = TILES.flatMap((t, i) => (t.collides ? [i] : []));

/** Builds a playable level from a parsed text map (see src/world/mapText.ts). */
export class World {
  readonly walls: Phaser.Tilemaps.TilemapLayer;
  readonly width: number;
  readonly height: number;
  /** Blocked for walking / pathfinding: walls, solid fixtures, locked doors, the van. */
  readonly nav: Grid;
  /** Blocks line of sight: walls and closed doors. */
  readonly sight: Grid;
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly fixtures: Fixture[] = [];
  readonly doors: Door[] = [];
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

    const layer = (data: number[][], depth: number) => {
      const tilemap = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
      const tileset = tilemap.addTilesetImage('school', TILESET_TEXTURE, TILE, TILE, 0, 0)!;
      return (tilemap.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer).setDepth(depth);
    };
    layer(map.floor, 0);
    this.walls = layer(map.walls, 1);
    this.walls.setCollision(COLLIDING);
    this.width = map.width * TILE;
    this.height = map.height * TILE;

    const walls = wallGrid(map);
    this.nav = wallGrid(map);
    this.sight = wallGrid(map);
    this.solids = scene.physics.add.staticGroup();

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
      this.fixtures.push(new Fixture(scene, def, x, y, def.wallMounted ? wallRotation(walls, f.x, f.y) : 0));
      if (def.solid) {
        this.nav.set(f.x, f.y, true);
        this.solids.add(scene.add.zone(x, y, TILE * 0.8, TILE * 0.8));
      }
    }

    for (const d of map.doors) {
      const rect = new Phaser.Geom.Rectangle(d.x * TILE, d.y * TILE, d.w * TILE, d.h * TILE);
      this.doors.push(new Door(scene, this.solids, [this.nav, this.sight], rect, true, BALANCE.doors.unlockSeconds));
    }

    const v = map.van;
    const rect = new Phaser.Geom.Rectangle(v.x * TILE, v.y * TILE, v.w * TILE, v.h * TILE);
    const pad = BALANCE.vanReachTiles * TILE;
    const reach = new Phaser.Geom.Rectangle(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2);
    // The van art is drawn nose-up (tall); turn it when the van block is wider than tall.
    const sideways = rect.width > rect.height;
    const image = scene.add
      .image(rect.centerX, rect.centerY, 'van')
      .setRotation(sideways ? -Math.PI / 2 : 0)
      .setDisplaySize(sideways ? rect.height : rect.width, sideways ? rect.width : rect.height)
      .setDepth(6);
    this.solids.add(scene.add.zone(rect.centerX, rect.centerY, rect.width - 12, rect.height - 12));
    for (let ty = v.y; ty < v.y + v.h; ty++) for (let tx = v.x; tx < v.x + v.w; tx++) this.nav.set(tx, ty, true);
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

/** Wall-mounted sprites are drawn against the top edge; turn them to face away from their wall. */
function wallRotation(walls: Grid, tx: number, ty: number): number {
  if (walls.blocked(tx, ty - 1)) return 0;
  if (walls.blocked(tx, ty + 1)) return Math.PI;
  if (walls.blocked(tx - 1, ty)) return -Math.PI / 2;
  if (walls.blocked(tx + 1, ty)) return Math.PI / 2;
  return 0;
}
