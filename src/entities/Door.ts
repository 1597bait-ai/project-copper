import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import type { Grid } from '../systems/Grid';
import { DEPTH } from '../ui/depth';

/**
 * The texture for a doorway: seen from the front in a wall running across the screen, from
 * above in one running up and down; a single door for a 1-tile doorway, double doors otherwise
 * (stretched to fit doorways longer than 2 tiles).
 */
export function doorKey(rect: { width: number; height: number }, locked: boolean, tileSize: number): string {
  const vertical = rect.height > rect.width;
  const single = Math.max(rect.width, rect.height) <= tileSize;
  return `door_${locked ? 'locked' : 'open'}${vertical ? '_v' : ''}${single ? (vertical ? '1' : '_1') : ''}`;
}

/** A door that blocks movement and sight until it is unlocked. Once open it stays open for the shift. */
export class Door {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly blocker: Phaser.GameObjects.Zone;
  locked: boolean;

  constructor(
    scene: Phaser.Scene,
    solids: Phaser.Physics.Arcade.StaticGroup,
    private readonly grids: Grid[],
    readonly rect: Phaser.Geom.Rectangle,
    locked: boolean,
    readonly unlockSeconds: number = BALANCE.doors.unlockSeconds,
  ) {
    this.locked = locked;
    this.sprite = scene.add
      .image(rect.centerX, rect.centerY, doorKey(rect, locked, grids[0].tileSize))
      .setDisplaySize(rect.width, rect.height)
      .setDepth(DEPTH.doors);
    this.blocker = scene.add.zone(rect.centerX, rect.centerY, rect.width, rect.height);
    solids.add(this.blocker);
    this.setBlocked(locked);
  }

  get x(): number {
    return this.rect.centerX;
  }

  get y(): number {
    return this.rect.centerY;
  }

  unlock(): void {
    this.locked = false;
    this.sprite.setTexture(doorKey(this.rect, false, this.grids[0].tileSize)).setDisplaySize(this.rect.width, this.rect.height);
    this.setBlocked(false);
  }

  private setBlocked(blocked: boolean) {
    (this.blocker.body as Phaser.Physics.Arcade.StaticBody).enable = blocked;
    const size = this.grids[0].tileSize;
    for (let x = this.rect.left; x < this.rect.right; x += size) {
      for (let y = this.rect.top; y < this.rect.bottom; y += size) {
        for (const grid of this.grids) grid.set(Math.floor(x / size), Math.floor(y / size), blocked);
      }
    }
  }
}
