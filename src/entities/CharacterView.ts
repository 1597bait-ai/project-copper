import Phaser from 'phaser';
import { SHEET_PAD } from '../art/characters';
import { PX } from '../art/pixel';
import { TILE } from '../config/balance';
import { sortDepth } from '../ui/depth';
import { type Facing, facingOf, nextFacing, restartDistance, sleepFrame, walkFrame, workFrame } from './characterPose';

// How a person looks in the world: Dalton, Mr. Gravy, the students, the sleepy coworker.
//
// Texture contract (drawn in src/art/characters.ts):
//   `${key}`        one front-facing standing image (menus, the map editor)
//   `${key}_sheet`  animation frames named `${facing}-${i}`: facing down/up/left/right,
//                   i = 0 standing, 1 and 2 walking steps. Optional: `${facing}-yell` (shouting,
//                   pointing), `${facing}-work-0|1` (hammering) and `sleep-0|1` (dozing).
//   `${key}_big`    portrait for menus and dialog boxes
// Sheet frames have an empty border of SHEET_PAD art pixels (so neighbours don't bleed in).
//
// The game moves a physics body around; every frame the owner calls update() with the body's
// position and facing angle, and the view picks the frame, sorts itself by depth (by its feet)
// and places the shadow and, for the player, the scrap sack.

export type { Facing };
export { facingOf };

export interface CharacterViewOptions {
  /** Students are drawn a little smaller than the grown-ups. */
  scale?: number;
}

export interface PoseOptions {
  /** Faster steps (chasing, fleeing). */
  running?: boolean;
  /** Busy with the hands (scrapping, unlocking): hammering at whatever it faces. */
  working?: boolean;
  /**
   * A special pose, when the sheet has frames for it: 'yell' (`${facing}-yell`, shouting and
   * pointing) or 'sleep' (`sleep-0`/`sleep-1`, dozing). Falls back to standing without them.
   */
  pose?: 'yell' | 'sleep';
}

/** Feet sit this far below the body centre (unscaled px): people stand on their tile, not on its middle. */
const FEET = Math.round(TILE * 0.22);
/** Distance per walking frame (px): the walk cycle keeps pace with the ground. */
const STRIDE = { walk: 26, run: 30 };
/** Blocked against a wall but still pushing: walk in place at this many px per second. */
const IN_PLACE_SPEED = 80;
/** The shadow art is 14 art px wide, drawn for a 16 px wide person. */
const SHADOW_FOR_WIDTH = 16 * PX;
/** The empty border around sheet frames, in texture px. */
const PAD = SHEET_PAD * PX;

export class CharacterView {
  /** Positioned at the body centre. Owners may add their own children. */
  readonly container: Phaser.GameObjects.Container;
  facing: Facing = 'down';
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly sack: Phaser.GameObjects.Image;
  private readonly scale: number;
  private carry = 0;
  /** Sheet texture key, or null when the look has no frames (then the plain image is shown). */
  private sheet: string | null = null;
  private frame = '';
  private walked = 0;
  private wasMoving = false;
  private lastX: number;
  private lastY: number;
  private lastTime = -1;
  private sackInFront = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private key: string,
    x: number,
    y: number,
    opts: CharacterViewOptions = {},
  ) {
    this.scale = opts.scale ?? 1;
    this.lastX = x;
    this.lastY = y;
    this.shadow = scene.add.image(0, this.feet, 'shadow');
    this.sack = scene.add.image(0, 0, 'sack').setVisible(false);
    this.sprite = scene.add.image(0, this.feet, key).setOrigin(0.5, 1).setScale(this.scale);
    this.container = scene.add.container(x, y, [this.shadow, this.sack, this.sprite]).setDepth(sortDepth(y + this.feet));
    this.applyKey();
    this.show(`${this.facing}-0`);
  }

  /** The look currently shown. */
  get textureKey(): string {
    return this.key;
  }

  /** Where the feet touch the floor, below the body centre. */
  get feet(): number {
    return FEET * this.scale;
  }

  /** How far above the body centre the head ends (negative): '!' marks and speech bubbles go here. */
  get headTop(): number {
    return this.feet - this.artHeight;
  }

  /** Height of the person drawn (without the sheet frame's empty border). */
  private get artHeight(): number {
    return this.sprite.displayHeight - (this.sheet ? 2 * PAD * this.scale : 0);
  }

  /** Swaps the look (Dalton's disguise). Keeps the facing and animation. */
  setKey(key: string): this {
    if (key === this.key) return this;
    this.key = key;
    this.applyKey();
    const frame = this.frame;
    this.frame = '';
    this.show(frame || `${this.facing}-0`);
    return this;
  }

  /** How full the scrap sack on the back is, 0 (no sack) to 1. */
  setCarry(fill: number): this {
    this.carry = Phaser.Math.Clamp(fill, 0, 1);
    return this;
  }

  /** Call every frame with the body position, the facing angle (radians) and whether it is moving. */
  update(x: number, y: number, angle: number, moving: boolean, time: number, opts: PoseOptions = {}): void {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(100, time - this.lastTime));
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    this.lastTime = time;
    this.lastX = x;
    this.lastY = y;

    this.facing = nextFacing(this.facing, angle);
    this.container.setPosition(x, y).setDepth(sortDepth(y + this.feet));

    const stride = (opts.running ? STRIDE.run : STRIDE.walk) * this.scale;
    let frame: string;
    let step = false;
    if (opts.pose === 'sleep' && this.has('sleep-0')) {
      frame = `sleep-${sleepFrame(time)}`;
    } else if (opts.working) {
      frame = this.has(`${this.facing}-work-0`) ? `${this.facing}-work-${workFrame(time)}` : `${this.facing}-0`;
    } else if (opts.pose === 'yell' && this.has(`${this.facing}-yell`)) {
      frame = `${this.facing}-yell`;
    } else if (moving) {
      // Keeps walking in place when pushing against a wall.
      this.walked += Math.max(moved, (IN_PLACE_SPEED * dt) / 1000);
      const i = walkFrame(this.walked, stride);
      step = i !== 0;
      frame = `${this.facing}-${i}`;
    } else {
      frame = `${this.facing}-0`;
    }
    if (this.wasMoving && !moving) this.walked = restartDistance(this.walked, stride);
    this.wasMoving = moving;
    this.show(frame);

    // Without the hammering frames, at least wiggle while working.
    this.sprite.x = opts.working && !this.has(`${this.facing}-work-0`) ? Math.sin(time / 45) * 2 * this.scale : 0;
    this.placeSack(step);
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

  private applyKey() {
    const sheet = `${this.key}_sheet`;
    this.sheet = this.scene.textures.exists(sheet) ? sheet : null;
    // The frame's bottom border hangs below the feet.
    this.sprite.y = this.feet + (this.sheet ? PAD * this.scale : 0);
    // A bigger person (Mr. Gravy) gets a bigger shadow.
    const frame = this.sheet ? this.scene.textures.getFrame(sheet, 'down-0') : null;
    const width = frame ? frame.width - 2 * PAD : SHADOW_FOR_WIDTH;
    this.shadow.setScale((width / SHADOW_FOR_WIDTH) * this.scale);
  }

  private has(frame: string): boolean {
    return this.sheet !== null && this.scene.textures.get(this.sheet).has(frame);
  }

  /** Shows a sheet frame (falls back to standing, or to the plain image without a sheet). */
  private show(frame: string) {
    if (!this.sheet) {
      if (this.sprite.texture.key !== this.key) this.sprite.setTexture(this.key);
      this.frame = '';
      return;
    }
    if (!this.has(frame)) frame = this.has(`${this.facing}-0`) ? `${this.facing}-0` : 'down-0';
    if (frame === this.frame && this.sprite.texture.key === this.sheet) return;
    this.frame = frame;
    this.sprite.setTexture(this.sheet, frame);
  }

  /**
   * The sack hangs on the back: peeking over the shoulder when facing down (behind the body), on
   * the back facing up (in front), behind the body at the side otherwise.
   */
  private placeSack(step: boolean) {
    this.sack.setVisible(this.carry > 0);
    if (this.carry <= 0) return;
    const s = this.scale;
    const bob = step ? PX * s : 0;
    // Shoulders are half way down the person; the back's middle a little lower.
    const shoulders = this.feet - this.artHeight * 0.5;
    let x = 0;
    let y = shoulders + 8 * s;
    let inFront = false;
    switch (this.facing) {
      case 'down':
        x = 18 * s;
        y = shoulders - 10 * s;
        break;
      case 'up':
        y = shoulders + 10 * s;
        inFront = true;
        break;
      case 'left':
        x = 20 * s;
        break;
      case 'right':
        x = -20 * s;
        break;
    }
    this.sack.setPosition(x, y + bob).setScale((0.65 + this.carry * 0.5) * s);
    if (inFront !== this.sackInFront) {
      this.sackInFront = inFront;
      if (inFront) this.container.moveAbove(this.sack, this.sprite);
      else this.container.moveBelow(this.sack, this.sprite);
    }
  }
}
