import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { TIER_COLORS, type FixtureDef } from '../config/fixtures';
import { MATERIALS } from '../config/materials';

/** A scrappable thing placed on the map (fountain, heater, desk...). */
export class Fixture {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  ready = true;
  private rechargeLeft = 0;
  private rechargeTotal = 1;

  constructor(
    scene: Phaser.Scene,
    readonly def: FixtureDef,
    readonly x: number,
    readonly y: number,
    rotation: number,
  ) {
    this.glow = scene.add.graphics().setDepth(4).setVisible(false);
    this.glow.fillStyle(TIER_COLORS[def.tier], 0.28).fillCircle(x, y, TILE * 0.62);
    this.glow.lineStyle(4, TIER_COLORS[def.tier], 0.9).strokeCircle(x, y, TILE * 0.62);
    this.sprite = scene.add.image(x, y, def.id).setRotation(rotation).setDepth(5);
    this.ring = scene.add.graphics().setDepth(6);
  }

  get label(): string {
    return this.def.name;
  }

  get materialName(): string {
    return MATERIALS[this.def.material].name;
  }

  strip(rechargeSeconds: number): void {
    this.ready = false;
    this.rechargeLeft = this.rechargeTotal = rechargeSeconds;
    this.sprite.setTint(0x5d5d5d).setAlpha(0.75);
    this.setTargeted(false);
  }

  update(dt: number): void {
    if (this.ready) return;
    this.rechargeLeft -= dt;
    if (this.rechargeLeft <= 0) {
      this.ready = true;
      this.sprite.clearTint().setAlpha(1);
      this.ring.clear();
      this.sprite.scene.tweens.add({ targets: this.sprite, scale: { from: 1.25, to: 1 }, duration: 250, ease: 'Back.Out' });
      return;
    }
    const done = 1 - this.rechargeLeft / this.rechargeTotal;
    const cx = this.x + TILE * 0.3;
    const cy = this.y - TILE * 0.3;
    this.ring.clear();
    this.ring.fillStyle(0x12151c, 0.8).fillCircle(cx, cy, 11);
    this.ring.lineStyle(5, 0x7ddc7d, 1);
    this.ring.beginPath();
    this.ring.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
    this.ring.strokePath();
  }

  setTargeted(on: boolean): void {
    this.glow.setVisible(on && this.ready);
  }
}
