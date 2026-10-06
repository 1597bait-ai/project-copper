import Phaser from 'phaser';
import { RECHARGE_FRAMES } from '../art/objects';
import { PX } from '../art/pixel';
import { TILE } from '../config/balance';
import { TIER_COLORS, type FixtureDef } from '../config/fixtures';
import { MATERIALS } from '../config/materials';
import { DEPTH, sortDepth } from '../ui/depth';
import type { Mount } from '../world/autotile';

/** Milliseconds between the two positions of the pulsing corner brackets. */
const PULSE_MS = 320;

/**
 * The texture and mirroring for a fixture: the front view, or for one hanging on a wall to its
 * left or right the side view (drawn against a left wall, mirrored for a right one).
 */
export function fixtureLook(textures: Phaser.Textures.TextureManager, def: FixtureDef, mount: Mount): { key: string; flipX: boolean } {
  const side = `${def.id}_side`;
  if (mount === 'front' || !def.wallMounted || !textures.exists(side)) return { key: def.id, flipX: false };
  return { key: side, flipX: mount === 'right' };
}

/** A scrappable thing placed on the map (fountain, heater, desk...). */
export class Fixture {
  readonly sprite: Phaser.GameObjects.Image;
  /** Little clock showing how long until it can be scrapped again. */
  private readonly ring: Phaser.GameObjects.Image;
  /** Spot of light on the floor under it while it is the target. */
  private readonly glow: Phaser.GameObjects.Image;
  /** Corner brackets around it while it is the target, in the colour of its value. */
  private readonly corners: Phaser.GameObjects.Image[];
  /** Steps the brackets in and out while it is the target. */
  private pulse: Phaser.Time.TimerEvent | null = null;
  private pulseOut = false;
  ready = true;
  private rechargeLeft = 0;
  private rechargeTotal = 1;

  constructor(
    scene: Phaser.Scene,
    readonly def: FixtureDef,
    readonly x: number,
    readonly y: number,
    mount: Mount = 'front',
  ) {
    const look = fixtureLook(scene.textures, def, mount);
    const bottom = y + TILE / 2;
    // Solid things sort by the bottom of their tile; a flat pile on the floor sorts by its top so
    // anyone standing on it is drawn over it.
    const depth = def.solid ? sortDepth(bottom) : sortDepth(y - TILE / 2);
    this.sprite = scene.add.image(x, bottom, look.key).setOrigin(0.5, 1).setFlipX(look.flipX).setDepth(depth);
    const tint = TIER_COLORS[def.tier];
    this.glow = scene.add.image(x, bottom - 8, 'fixture_glow').setOrigin(0.5, 1).setTint(tint).setDepth(DEPTH.glow).setVisible(false);
    this.corners = [0, 1, 2, 3].map((i) =>
      scene.add
        .image(0, 0, 'select_corner')
        .setFlip(i === 1 || i === 3, i >= 2)
        .setTint(tint)
        .setDepth(depth + 1e-7)
        .setVisible(false),
    );
    this.ring = scene.add.image(0, 0, 'recharge', 'recharge-0').setDepth(DEPTH.marks).setVisible(false);
    const b = this.sprite.getBounds();
    this.ring.setPosition(Math.min(b.right, x + TILE / 2) - 4, b.top + 14);
  }

  get label(): string {
    return this.def.name;
  }

  get materialName(): string {
    return MATERIALS[this.def.material].name;
  }

  /** Brackets hug the sprite (tall things too), stepping out by one art pixel on every pulse. */
  private placeCorners() {
    const b = this.sprite.getBounds();
    const out = this.pulseOut ? PX : 0;
    // Each bracket image has a 1-art-pixel margin, so its corner pixel sits PX inside the image.
    const left = b.left - out - PX;
    const right = b.right + out + PX;
    const top = b.top - out - PX;
    const bottom = b.bottom + out + PX;
    const [tl, tr, bl, br] = this.corners;
    tl.setOrigin(0, 0).setPosition(left, top);
    tr.setOrigin(1, 0).setPosition(right, top);
    bl.setOrigin(0, 1).setPosition(left, bottom);
    br.setOrigin(1, 1).setPosition(right, bottom);
  }

  strip(rechargeSeconds: number): void {
    this.ready = false;
    this.rechargeLeft = this.rechargeTotal = rechargeSeconds;
    this.sprite.setTint(0x6c6c78).setAlpha(0.85);
    this.setTargeted(false);
    this.ring.setFrame('recharge-0').setVisible(true);
  }

  update(dt: number): void {
    if (this.ready) return;
    this.rechargeLeft -= dt;
    if (this.rechargeLeft <= 0) {
      this.ready = true;
      this.sprite.clearTint().setAlpha(1);
      this.ring.setVisible(false);
      // Pops back up from its feet (the sprite stands on its bottom edge).
      this.sprite.scene.tweens.add({ targets: this.sprite, scale: { from: 1.25, to: 1 }, duration: 250, ease: 'Back.Out' });
      return;
    }
    const done = 1 - this.rechargeLeft / this.rechargeTotal;
    this.ring.setFrame(`recharge-${Math.min(RECHARGE_FRAMES - 1, Math.floor(done * RECHARGE_FRAMES))}`);
  }

  setTargeted(on: boolean): void {
    const show = on && this.ready;
    if (show === this.glow.visible) return;
    this.glow.setVisible(show);
    for (const c of this.corners) c.setVisible(show);
    this.pulse?.remove(false);
    this.pulse = null;
    if (!show) return;
    this.pulseOut = false;
    this.placeCorners();
    this.pulse = this.sprite.scene.time.addEvent({
      delay: PULSE_MS,
      loop: true,
      callback: () => {
        this.pulseOut = !this.pulseOut;
        this.placeCorners();
      },
    });
  }
}
