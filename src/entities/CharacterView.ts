import Phaser from 'phaser';
import { sortDepth } from '../ui/depth';

// How a person looks in the world: Dalton, Mr. Gravy, the students, the sleepy coworker.
//
// Texture contract (see src/art/characters.ts):
//   `${key}`        one front-facing standing image (menus, the map editor)
//   `${key}_sheet`  animation frames named `${facing}-${i}`: facing down/up/left/right,
//                   i = 0 standing, 1 and 2 walking steps
//   `${key}_big`    portrait for menus and dialog boxes
//
// The game moves a physics body around; every frame the owner calls update() with the body's
// position and facing angle, and the view picks the frame, bobs, sorts itself by depth and
// draws the shadow (and the scrap sack, for the player).

export type Facing = 'down' | 'up' | 'left' | 'right';

/** Which way a sprite faces for an angle in radians (0 = right, PI/2 = down). */
export function facingOf(angle: number): Facing {
  const a = Phaser.Math.Angle.Wrap(angle);
  if (a > Math.PI / 4 && a < (3 * Math.PI) / 4) return 'down';
  if (a < -Math.PI / 4 && a > (-3 * Math.PI) / 4) return 'up';
  return Math.abs(a) <= Math.PI / 4 ? 'right' : 'left';
}

export interface CharacterViewOptions {
  /** Students are drawn a little smaller than the grown-ups. */
  scale?: number;
}

export interface PoseOptions {
  /** Faster steps (chasing, fleeing). */
  running?: boolean;
  /** Busy with the hands (scrapping, unlocking): a working wiggle instead of walking. */
  working?: boolean;
  /**
   * A special pose, when the sheet has frames for it: 'yell' (`${facing}-yell`, shouting and
   * pointing) or 'sleep' (`sleep-0`/`sleep-1`, dozing). Falls back to standing without them.
   */
  pose?: 'yell' | 'sleep';
}

export class CharacterView {
  /** Positioned at the body centre. Owners may add their own children. */
  readonly container: Phaser.GameObjects.Container;
  facing: Facing = 'down';
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly sack: Phaser.GameObjects.Image;
  private readonly scale: number;
  private carry = 0;

  constructor(
    scene: Phaser.Scene,
    private key: string,
    x: number,
    y: number,
    opts: CharacterViewOptions = {},
  ) {
    this.scale = opts.scale ?? 1;
    this.shadow = scene.add.image(0, 6, 'shadow').setScale(0.9 * this.scale);
    this.sack = scene.add.image(-20, 0, 'sack').setVisible(false);
    this.sprite = scene.add.image(0, 0, key).setScale(this.scale);
    this.container = scene.add.container(x, y, [this.shadow, this.sack, this.sprite]).setDepth(sortDepth(y));
  }

  /** The look currently shown. */
  get textureKey(): string {
    return this.key;
  }

  /** How far above the body centre the head ends (negative): '!' marks and speech bubbles go here. */
  get headTop(): number {
    return -32 * this.scale;
  }

  /** Swaps the look (Dalton's disguise). */
  setKey(key: string): this {
    this.key = key;
    this.sprite.setTexture(key);
    return this;
  }

  /** How full the scrap sack on the back is, 0 (no sack) to 1. */
  setCarry(fill: number): this {
    this.carry = Phaser.Math.Clamp(fill, 0, 1);
    return this;
  }

  /** Call every frame with the body position, the facing angle (radians) and whether it is moving. */
  update(x: number, y: number, angle: number, moving: boolean, time: number, opts: PoseOptions = {}): void {
    this.facing = facingOf(angle);
    this.container.setPosition(x, y).setDepth(sortDepth(y));
    // Placeholder until the pixel sheets exist: the old top-down art, turned to face the angle.
    this.sprite.rotation = opts.working ? angle + Math.sin(time / 45) * 0.12 : angle;
    const bob = opts.running ? 60 : 80;
    this.sprite.setScale(this.scale * (moving ? 1 + Math.sin(time / bob) * 0.03 : 1));
    this.sack.setVisible(this.carry > 0);
    if (this.carry > 0) {
      const back = angle + Math.PI;
      this.sack.setPosition(Math.cos(back) * 22, Math.sin(back) * 22).setScale(0.65 + this.carry * 0.55);
    }
  }

  setAlpha(a: number): this {
    this.container.setAlpha(a);
    return this;
  }

  setTint(color: number): this {
    this.sprite.setTint(color);
    return this;
  }

  clearTint(): this {
    this.sprite.clearTint();
    return this;
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v);
    return this;
  }

  destroy(): void {
    this.container.destroy();
  }
}
