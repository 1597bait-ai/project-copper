import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { ABILITIES, type AbilityDef, type CharacterDef } from '../config/characters';
import { Bag } from '../systems/Bag';

export const PLAYER_RADIUS = TILE * 0.3;

/** A timed action the player stands still for (scrapping a fixture, unlocking a door). */
export interface Channel {
  kind: 'scrap' | 'unlock';
  duration: number;
  elapsed: number;
  onComplete: () => void;
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly sack: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  readonly bag: Bag;
  readonly speed: number;
  readonly ability: AbilityDef | null;
  facing = 0;
  abilityLeft = 0;
  abilityCooldown = 0;
  channel: Channel | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly character: CharacterDef,
  ) {
    this.zone = scene.add.zone(x, y, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(PLAYER_RADIUS);
    this.body.setCollideWorldBounds(true);

    this.shadow = scene.add.image(x, y + 6, 'shadow').setScale(0.9).setDepth(9);
    this.sack = scene.add.image(-20, 0, 'sack').setVisible(false);
    this.sprite = scene.add.image(0, 0, character.sprite);
    this.view = scene.add.container(x, y, [this.sack, this.sprite]).setDepth(10);

    this.bag = new Bag(BALANCE.bagCapacity(character.stats.carry));
    this.speed = BALANCE.tilesPerSecond(character.stats.speed) * TILE;
    this.ability = character.ability ? ABILITIES[character.ability] : null;
  }

  get x(): number {
    return this.zone.x;
  }

  get y(): number {
    return this.zone.y;
  }

  get isScrapping(): boolean {
    return this.channel?.kind === 'scrap';
  }

  get disguised(): boolean {
    return this.ability?.id === 'student_disguise' && this.abilityLeft > 0;
  }

  get lookingBusy(): boolean {
    return this.ability?.id === 'look_busy' && this.abilityLeft > 0;
  }

  /** Board: the boss "only sees PC if they are carrying scrap" — or caught in the act of scrapping. */
  get suspicious(): boolean {
    if (this.isScrapping) return !this.lookingBusy;
    if (!this.bag.isEmpty) return !this.disguised;
    return false;
  }

  move(dx: number, dy: number): void {
    if (this.channel) {
      this.body.setVelocity(0, 0);
      return;
    }
    this.body.setVelocity(dx * this.speed, dy * this.speed);
    if (dx * dx + dy * dy > 0.01) this.facing = Math.atan2(dy, dx);
  }

  /** Returns true if the ability fired. */
  useAbility(): boolean {
    if (!this.ability || this.abilityCooldown > 0) return false;
    this.abilityLeft = this.ability.duration;
    this.abilityCooldown = this.ability.cooldown;
    this.refreshLook();
    return true;
  }

  cancelAbility(): void {
    if (this.abilityLeft <= 0) return;
    this.abilityLeft = 0;
    this.refreshLook();
  }

  startChannel(channel: Channel): void {
    this.channel = channel;
    this.body.setVelocity(0, 0);
    // Board: Dalton's disguise only covers carrying, so scrapping blows it.
    if (channel.kind === 'scrap' && this.disguised) this.cancelAbility();
  }

  update(dt: number): void {
    if (this.abilityCooldown > 0) this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (this.abilityLeft > 0) {
      this.abilityLeft = Math.max(0, this.abilityLeft - dt);
      if (this.abilityLeft === 0) this.refreshLook();
    }
    if (this.channel) {
      this.channel.elapsed += dt;
      if (this.channel.elapsed >= this.channel.duration) {
        const done = this.channel;
        this.channel = null;
        done.onComplete();
      }
    }
  }

  syncView(time: number): void {
    const moving = this.body.speed > 5;
    this.view.setPosition(this.x, this.y);
    this.shadow.setPosition(this.x, this.y + 6);
    // Smoothly turn toward the facing direction, with a little waddle while walking.
    const current = this.sprite.rotation;
    const delta = Phaser.Math.Angle.Wrap(this.facing - current);
    this.sprite.rotation = current + delta * 0.35;
    this.sprite.setScale(moving ? 1 + Math.sin(time / 70) * 0.03 : 1);
    if (this.channel) this.sprite.rotation = this.facing + Math.sin(time / 45) * 0.12;

    const fill = this.bag.capacity > 0 ? this.bag.total / this.bag.capacity : 0;
    const showSack = fill > 0 && !this.disguised;
    this.sack.setVisible(showSack);
    if (showSack) {
      const back = this.sprite.rotation + Math.PI;
      this.sack.setPosition(Math.cos(back) * 22, Math.sin(back) * 22).setScale(0.65 + fill * 0.55);
    }
    this.view.setAlpha(this.disguised ? 0.92 : 1);
  }

  private refreshLook(): void {
    const disguiseKey = `${this.character.sprite}_disguise`;
    const useDisguise = this.disguised && this.sprite.scene.textures.exists(disguiseKey);
    this.sprite.setTexture(useDisguise ? disguiseKey : this.character.sprite);
    if (this.lookingBusy) this.sprite.setTint(0xfff2a8);
    else this.sprite.clearTint();
  }

  destroy(): void {
    this.view.destroy();
    this.shadow.destroy();
    this.zone.destroy();
  }
}
