import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import type { Grid } from '../systems/Grid';

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
    const vertical = rect.height > rect.width;
    this.sprite = scene.add
      .image(rect.centerX, rect.centerY, locked ? 'door_locked' : 'door_open')
      .setRotation(vertical ? Math.PI / 2 : 0)
      .setDisplaySize(Math.max(rect.width, rect.height), Math.min(rect.width, rect.height))
      .setDepth(3);
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
    this.sprite.setTexture('door_open');
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
