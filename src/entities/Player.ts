import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { ABILITIES, type AbilityDef, type CharacterDef } from '../config/characters';
import { Bag } from '../systems/Bag';
import { CharacterView } from './CharacterView';

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
  readonly view: CharacterView;
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

    this.view = new CharacterView(scene, character.sprite, x, y);

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

  /**
   * Dressed as a student: other students don't give him a second look, even on high alert. Not
   * while he's hammering at a fixture, though: the disguise only covers carrying.
   */
  get blendsIn(): boolean {
    return this.disguised && !this.isScrapping;
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
    // Board: Dalton's disguise only covers carrying, so it can't be put on mid-scrap (see startChannel).
    if (this.ability.id === 'student_disguise' && this.isScrapping) return false;
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
    const fill = this.bag.capacity > 0 ? this.bag.total / this.bag.capacity : 0;
    this.view.setCarry(this.disguised ? 0 : fill);
    this.view.update(this.x, this.y, this.facing, moving, time, { working: this.channel !== null });
    this.view.setAlpha(this.disguised ? 0.92 : 1);
  }

  private refreshLook(): void {
    const disguiseKey = `${this.character.sprite}_disguise`;
    const useDisguise = this.disguised && this.zone.scene.textures.exists(disguiseKey);
    this.view.setKey(useDisguise ? disguiseKey : this.character.sprite);
    if (this.lookingBusy) this.view.setTint(0xfff2a8);
    else this.view.clearTint();
  }

  destroy(): void {
    this.view.destroy();
    this.zone.destroy();
  }
}
