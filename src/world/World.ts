import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { FIXTURES } from '../config/fixtures';
import { Door } from '../entities/Door';
import { Fixture } from '../entities/Fixture';
import { Grid } from '../systems/Grid';
import type { Point } from '../systems/pathfinding';
import { tilesetTextureKey } from './maps';

type TiledObject = Phaser.Types.Tilemaps.TiledObject;

export interface Room {
  name: string;
  kind: string;
  rect: Phaser.Geom.Rectangle;
}

export interface Van {
  rect: Phaser.Geom.Rectangle;
  reach: Phaser.Geom.Rectangle;
  image: Phaser.GameObjects.Image;
}

/** Reads a Tiled object's custom property (handles both Tiled property formats). */
export function prop<T>(o: TiledObject, name: string): T | undefined {
  const props = o.properties as unknown;
  if (Array.isArray(props)) return props.find((p: { name: string }) => p.name === name)?.value as T | undefined;
  if (props && typeof props === 'object') return (props as Record<string, T>)[name];
  return undefined;
}

/**
 * Builds a playable level from a Tiled map:
 *   tile layers  "floor", "walls" (tiles with the `collides` property block movement and sight)
 *   object layer "rooms"   rectangles, name = what the HUD shows
 *   object layer "objects" player_spawn, boss_spawn, van, fixture (name = fixture id), door, patrol (polyline)
 */
export class World {
  readonly map: Phaser.Tilemaps.Tilemap;
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
  readonly rooms: Room[] = [];
  readonly patrol: Point[] = [];
  readonly playerSpawn: Point;
  readonly bossSpawn: Point;
  readonly van: Van;

  constructor(scene: Phaser.Scene, key: string) {
    this.map = scene.make.tilemap({ key });
    const tilesets = this.map.tilesets.map((t) => this.map.addTilesetImage(t.name, tilesetTextureKey(t.name))!);
    this.map.createLayer('floor', tilesets, 0, 0)!.setDepth(0);
    this.walls = (this.map.createLayer('walls', tilesets, 0, 0) as Phaser.Tilemaps.TilemapLayer).setDepth(1);
    this.walls.setCollisionByProperty({ collides: true });
    this.width = this.map.widthInPixels;
    this.height = this.map.heightInPixels;

    this.nav = new Grid(this.map.width, this.map.height, TILE);
    this.sight = new Grid(this.map.width, this.map.height, TILE);
    const wallsOnly = new Grid(this.map.width, this.map.height, TILE);
    this.walls.forEachTile((t) => {
      if (t.index > 0 && t.properties?.collides) {
        for (const g of [this.nav, this.sight, wallsOnly]) g.set(t.x, t.y, true);
      }
    });
    this.solids = scene.physics.add.staticGroup();

    for (const o of this.map.getObjectLayer('rooms')?.objects ?? []) {
      this.rooms.push({
        name: o.name ?? '',
        kind: prop<string>(o, 'kind') ?? '',
        rect: new Phaser.Geom.Rectangle(o.x ?? 0, o.y ?? 0, o.width ?? 0, o.height ?? 0),
      });
    }
    // Smallest first, so a room inside a bigger area wins.
    this.rooms.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);

    let playerSpawn: Point | null = null;
    let bossSpawn: Point | null = null;
    let van: Van | null = null;
    for (const o of this.map.getObjectLayer('objects')?.objects ?? []) {
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      switch (o.type) {
        case 'player_spawn':
          playerSpawn = { x, y };
          break;
        case 'boss_spawn':
          bossSpawn = { x, y };
          break;
        case 'patrol':
          for (const p of o.polyline ?? []) this.patrol.push({ x: x + p.x, y: y + p.y });
          break;
        case 'fixture': {
          const def = FIXTURES[o.name ?? ''];
          if (!def) {
            console.warn(`Unknown fixture "${o.name}" in map ${key}`);
            break;
          }
          const { tx, ty } = this.nav.toTile(x, y);
          const fixture = new Fixture(scene, def, x, y, def.wallMounted ? wallRotation(wallsOnly, tx, ty) : 0);
          this.fixtures.push(fixture);
          if (def.solid) {
            this.nav.set(tx, ty, true);
            this.solids.add(scene.add.zone(x, y, TILE * 0.8, TILE * 0.8));
          }
          break;
        }
        case 'door': {
          const rect = new Phaser.Geom.Rectangle(x, y, o.width ?? TILE, o.height ?? TILE);
          const locked = prop<boolean>(o, 'locked') ?? true;
          const seconds = prop<number>(o, 'unlockSeconds') ?? BALANCE.doors.unlockSeconds;
          this.doors.push(new Door(scene, this.solids, [this.nav, this.sight], rect, locked, seconds));
          break;
        }
        case 'van': {
          const rect = new Phaser.Geom.Rectangle(x, y, o.width ?? TILE * 2, o.height ?? TILE * 4);
          const pad = BALANCE.vanReachTiles * TILE;
          const reach = new Phaser.Geom.Rectangle(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2);
          const image = scene.add.image(rect.centerX, rect.centerY, 'van').setDisplaySize(rect.width, rect.height).setDepth(6);
          this.solids.add(scene.add.zone(rect.centerX, rect.centerY, rect.width - 12, rect.height - 12));
          for (let ty = Math.floor(rect.top / TILE); ty < Math.ceil(rect.bottom / TILE); ty++) {
            for (let tx = Math.floor(rect.left / TILE); tx < Math.ceil(rect.right / TILE); tx++) this.nav.set(tx, ty, true);
          }
          van = { rect, reach, image };
          break;
        }
        default:
          break;
      }
    }

    if (!playerSpawn || !bossSpawn || !van) throw new Error(`Map ${key} needs player_spawn, boss_spawn and van objects`);
    this.playerSpawn = playerSpawn;
    this.bossSpawn = bossSpawn;
    this.van = van;
  }

  roomAt(x: number, y: number): string {
    return this.rooms.find((r) => r.rect.contains(x, y))?.name ?? '';
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
