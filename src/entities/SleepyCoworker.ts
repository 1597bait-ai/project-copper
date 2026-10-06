import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { BALANCE, TILE } from '../config/balance';
import { NPCS } from '../config/npcs';
import { shuffleTarget } from '../systems/coworker';
import { findPath, smoothPath, type Point } from '../systems/pathfinding';
import { DEPTH } from '../ui/depth';
import { textStyle } from '../ui/theme';
import type { World } from '../world/World';
import { CharacterView } from './CharacterView';
import { Emote } from './SpeechBubble';

/** Seconds it takes him to slide out from under the desk (still asleep). */
const CRAWL_SECONDS = 0.4;
/** Seconds of the jump when he jolts awake. */
const HOP_SECONDS = 0.25;
/** Seconds the '$' shows when he pays. */
const PAY_EMOTE_SECONDS = 1.6;
/** How many 'z's float up while he naps, and how long each takes to rise and fade (seconds). */
const ZS = 3;
const Z_SECONDS = 1.5;

export type CoworkerStep = 'nap' | 'jolt' | 'excuse' | 'bribe' | 'leave' | 'fade' | 'gone';

/** Beats the scene reacts to: a sound, his two lines (and the money), and cleaning up. */
export type CoworkerEvent = 'jolt' | 'excuse' | 'bribe' | 'gone';

/**
 * The sleepy coworker, found napping under a desk Dalton just scrapped. Crawls out still asleep
 * (floating Zs), jolts awake with a '!', makes an excuse, pays Dalton to keep quiet, then shuffles
 * off slowly and fades away. He has no physics body: he never blocks anyone and nobody blocks him.
 *
 *   nap -> jolt -> excuse -> bribe -> leave -> fade -> gone
 */
export class SleepyCoworker {
  readonly view: CharacterView;
  private readonly emote: Emote;
  private readonly zs: Phaser.GameObjects.Text[];
  step: CoworkerStep = 'nap';
  x: number;
  y: number;
  private facing = Math.PI / 2;
  /** Seconds in the current step. */
  private t = 0;
  private path: Point[] = [];
  private moving = false;
  private readonly from: Point;
  private readonly speed = BALANCE.sleepyCoworker.shuffleTilesPerSecond * TILE;

  /** `desk` is where he napped (the desk's centre), `spot` the floor beside it where he ends up. */
  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    desk: Point,
    private readonly spot: Point,
  ) {
    this.from = { ...desk };
    this.x = desk.x;
    this.y = desk.y;
    this.view = new CharacterView(scene, NPCS.sleepy_coworker.sprite, desk.x, desk.y);
    this.view.setAlpha(0);
    this.emote = new Emote(scene);
    this.zs = Array.from({ length: ZS }, () =>
      scene.add.text(0, 0, 'z', textStyle(24, '#ffffff', { strokeThickness: 5 })).setOrigin(0.5).setDepth(DEPTH.marks).setVisible(false),
    );
  }

  get gone(): boolean {
    return this.step === 'gone';
  }

  /** Runs one frame. `player` is where Dalton is (he faces him, then shuffles away from him). */
  update(dt: number, player: Point): CoworkerEvent | null {
    const c = BALANCE.sleepyCoworker;
    this.t += dt;
    this.moving = false;
    switch (this.step) {
      case 'nap': {
        // Slides out from under the desk, fading in, still fast asleep.
        const k = Math.min(1, this.t / CRAWL_SECONDS);
        this.x = Phaser.Math.Linear(this.from.x, this.spot.x, k);
        this.y = Phaser.Math.Linear(this.from.y, this.spot.y, k);
        this.view.setAlpha(k);
        if (this.t >= c.napSeconds) return this.next('jolt');
        return null;
      }
      case 'jolt':
        this.face(player);
        return this.t >= c.wakeSeconds ? this.next('excuse') : null;
      case 'excuse':
        this.face(player);
        return this.t >= c.lineSeconds[0] ? this.next('bribe') : null;
      case 'bribe':
        this.face(player);
        if (this.t >= c.lineSeconds[1]) this.leave(player);
        return null;
      case 'leave':
        this.shuffle(dt);
        if (!this.path.length || this.t >= c.shuffleSeconds) this.next('fade');
        return null;
      case 'fade':
        this.shuffle(dt);
        this.view.setAlpha(Math.max(0, 1 - this.t / c.fadeSeconds));
        return this.t >= c.fadeSeconds ? this.next('gone') : null;
      case 'gone':
        return null;
    }
  }

  syncView(time: number): void {
    if (this.gone) return;
    const napping = this.step === 'nap';
    // A little jump when he jolts awake.
    const hop = this.step === 'jolt' && this.t < HOP_SECONDS ? Math.round(Math.sin((this.t / HOP_SECONDS) * Math.PI) * 4) * PX : 0;
    this.view.update(this.x, this.y - hop, this.facing, this.moving, time, { pose: napping ? 'sleep' : undefined });

    const head = this.y - hop + this.view.headTop;
    const startled = this.step === 'jolt' || this.step === 'excuse';
    const paying = this.step === 'bribe' && this.t < PAY_EMOTE_SECONDS;
    this.emote.show(startled ? '!' : paying ? '$' : null, time);
    this.emote.place(this.x, head - 4, time);

    // Zs drift up and to the right, one after another, fading as they go.
    this.zs.forEach((z, i) => {
      z.setVisible(napping);
      if (!napping) return;
      const k = ((time / 1000 + (i * Z_SECONDS) / ZS) % Z_SECONDS) / Z_SECONDS;
      const x = this.x + 14 + k * 26 + Math.sin(k * Math.PI * 2) * 6;
      const y = head + 10 - k * 52;
      z.setPosition(Math.round(x / PX) * PX, Math.round(y / PX) * PX)
        .setScale(0.7 + k * 0.6)
        .setAlpha(Math.min(1, (1 - k) * 2) * this.view.container.alpha);
    });
  }

  destroy(): void {
    this.view.destroy();
    this.emote.destroy();
    for (const z of this.zs) z.destroy();
  }

  private next(step: CoworkerStep): CoworkerEvent | null {
    this.step = step;
    this.t = 0;
    return step === 'jolt' || step === 'excuse' || step === 'bribe' || step === 'gone' ? step : null;
  }

  /** Picks a spot away from Dalton and plans the way there. */
  private leave(player: Point) {
    const nav = this.world.nav;
    const here = nav.toTile(this.x, this.y);
    const away = nav.toTile(player.x, player.y);
    const goal = shuffleTarget(nav, { x: here.tx, y: here.ty }, { x: away.tx, y: away.ty }, BALANCE.sleepyCoworker.shuffleTiles);
    const tiles = findPath(nav, here.tx, here.ty, goal.x, goal.y);
    this.path = tiles ? smoothPath(nav, tiles, TILE * 0.25).slice(1) : [];
    this.next('leave');
  }

  /** Shuffles along the path (no physics: he floats through people). */
  private shuffle(dt: number) {
    const next = this.path[0];
    if (!next) return;
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this.x = next.x;
      this.y = next.y;
      this.path.shift();
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    this.facing = Math.atan2(dy, dx);
    this.moving = true;
  }

  private face(p: Point) {
    this.facing = Math.atan2(p.y - this.y, p.x - this.x);
  }
}
