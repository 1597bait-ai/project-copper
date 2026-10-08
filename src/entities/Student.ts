import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { STUDENT_LINES, type NpcDef } from '../config/npcs';
import { clearLine, findPath, smoothPath, type Point } from '../systems/pathfinding';
import { calmDown, followHolds, mindDanger, newMind, think, type MindTuning, type StudentMind, type Yell } from '../systems/studentMind';
import { conePolygon, inCone, type Cone } from '../systems/vision';
import { pickWanderTarget, wanderArea } from '../systems/wander';
import { DEPTH } from '../ui/depth';
import type { World } from '../world/World';
import { CharacterView } from './CharacterView';
import type { Player } from './Player';
import { Emote, SpeechBubble } from './SpeechBubble';

const RADIUS = TILE * 0.28;
/** The route to where Dalton was last seen is re-planned this often while following (seconds). */
const REPATH_SECONDS = 0.5;
/** Speech bubbles wrap at this width (world px) so they still fit on a zoomed-in phone screen. */
const BUBBLE_WRAP = 280;
/** Seconds a yell's speech bubble stays up after the yell itself. */
const YELL_BUBBLE_EXTRA = 0.7;
const CHATTER_SECONDS = 2.8;

const TUNING: MindTuning = BALANCE.students;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export type StudentState = 'idle' | 'walk' | 'notice' | 'yell' | 'follow';

/** A student just yelled for Mr. Gravy. The scene decides whether he heard it. */
export interface StudentYell {
  why: Yell;
  /** Where Dalton was when they yelled (where they want Mr. Gravy to go). */
  seen: Point;
}

/** What's going on around the student this frame. */
export interface StudentContext {
  /** Word got around: see further and wider, notice Dalton even empty-handed, walk faster, chatter. */
  highAlert: boolean;
}

/**
 * A student hanging around the halls and classrooms. See Dalton with scrap and they stop, point and
 * yell for Mr. Gravy, then slowly follow him, yelling again while they can see him, until they lose
 * him for a while. The decisions are in systems/studentMind.ts; this class walks, turns and talks.
 *
 *   idle (looks around) <-> walk (strolls somewhere nearby)
 *   sees scrap: yell -> follow -> (loses him) idle, ignoring him for a while
 *   high alert, sees him empty-handed: notice ('?') -> yell -> follow ...
 */
export class Student {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly view: CharacterView;
  readonly mind: StudentMind = newMind();
  private readonly emote: Emote;
  private readonly bubble: SpeechBubble;
  private readonly cone: Phaser.GameObjects.Graphics;

  facing = Math.random() * Math.PI * 2;
  /** Where Dalton was the last time this student saw him. */
  lastSeen: Point | null = null;
  /** What they do while calm. */
  private calm: 'idle' | 'walk' = 'idle';
  private highAlert = false;
  private path: Point[] = [];
  /** Seconds of standing around left (idle). */
  private timer = Phaser.Math.FloatBetween(...BALANCE.students.pauseSeconds);
  private lookT = 0;
  private lookBase = this.facing;
  private repathIn = 0;
  /** Seconds until they next say something on high alert; null until it starts. */
  private chatterIn: number | null = null;
  private stuckCheck = { x: 0, y: 0, t: 0 };
  /** The waypoint being walked to and where that leg started, to notice overshooting it. */
  private legTo: Point | null = null;
  private legFrom: Point = { x: 0, y: 0 };
  /** Tiles this student strolls between (see systems/wander.ts). */
  private readonly area: Point[];
  private readonly walkSpeed: number;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    readonly def: NpcDef,
    spawn: Point,
    index: number,
  ) {
    const { x, y } = spawn;
    this.zone = scene.add.zone(x, y, RADIUS * 2, RADIUS * 2);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(RADIUS);
    this.body.setCollideWorldBounds(true);

    const looks = def.variants?.length ? def.variants : [def.sprite];
    this.cone = scene.add.graphics().setDepth(DEPTH.cones);
    // Kids are drawn shorter in the art itself, so no scaling (that would blur the pixels).
    this.view = new CharacterView(scene, looks[index % looks.length], x, y);
    this.emote = new Emote(scene);
    this.bubble = new SpeechBubble(scene, BUBBLE_WRAP);

    this.walkSpeed = BALANCE.tilesPerSecond(def.speed) * TILE * BALANCE.students.walkFactor;

    const hangouts = BALANCE.students.hangouts;
    const likes = (tx: number, ty: number) => {
      const kind = world.roomKindAt((tx + 0.5) * TILE, (ty + 0.5) * TILE);
      return kind !== null && hangouts.includes(kind);
    };
    const home = world.nav.toTile(x, y);
    this.area = wanderArea(world.nav, { x: home.tx, y: home.ty }, BALANCE.students.wanderRadiusTiles, likes);
  }

  // Read the body: it moves in the physics step before update() runs, and the zone only catches up afterwards.
  get x(): number {
    return this.body.position.x + RADIUS;
  }

  get y(): number {
    return this.body.position.y + RADIUS;
  }

  get state(): StudentState {
    return this.mind.attention === 'calm' ? this.calm : this.mind.attention;
  }

  /** The '?' meter (high alert only), 0-1. */
  get suspicion(): number {
    return this.mind.suspicion;
  }

  /** Seconds left of leaving Dalton alone. Settable for tests. */
  get ignore(): number {
    return this.mind.ignore;
  }

  set ignore(seconds: number) {
    this.mind.ignore = seconds;
  }

  /** How much they light up the HUD's danger edge (0-1). */
  get danger(): number {
    return mindDanger(this.mind, BALANCE.students.danger);
  }

  get visionCone(): Cone {
    const s = BALANCE.students;
    const range = s.visionRangeTiles * (this.highAlert ? s.highAlertRangeFactor : 1) * TILE;
    const half = s.visionHalfAngleDeg + (this.highAlert ? s.highAlertExtraHalfAngleDeg : 0);
    return { origin: { x: this.x, y: this.y }, facing: this.facing, range, halfAngle: Phaser.Math.DegToRad(half) };
  }

  /** Runs the AI for one frame. Returns a yell for the scene to deal with, if they just yelled. */
  update(dt: number, player: Player, ctx: StudentContext): StudentYell | null {
    this.highAlert = ctx.highAlert;
    this.bubble.update(dt);

    const target = { x: player.x, y: player.y };
    const cone = this.visionCone;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const inView = inCone(this.world.sight, cone, target);
    const sees = inView && !player.blendsIn;
    const fooled = inView && player.blendsIn;
    const was = this.mind.attention;
    const why = think(this.mind, { sees, fooled, redHanded: player.suspicious, highAlert: ctx.highAlert, distance: dist / cone.range }, dt, TUNING);
    if (sees && this.mind.attention !== 'calm') this.lastSeen = target;
    if (was !== this.mind.attention) {
      if (this.mind.attention === 'calm') {
        this.rest();
        // The disguise worked: they had a good look and lost interest.
        if (fooled) this.bubble.say(pick(STUDENT_LINES.fooled), CHATTER_SECONDS);
      } else if (was === 'calm') {
        this.path = [];
        // Stop chatting: the '?' (or the yell) is what Dalton needs to see now.
        this.bubble.hide();
      }
    }

    if (why) {
      this.stop();
      this.bubble.say(pick(STUDENT_LINES[why]), BALANCE.students.yellSeconds + YELL_BUBBLE_EXTRA, 'shout');
      return { why, seen: { ...target } };
    }

    switch (this.mind.attention) {
      case 'yell':
        this.stop();
        this.turnToward(this.angleTo(sees ? target : this.lastSeen), dt, 10);
        break;
      case 'follow':
        this.followPlayer(dt, sees, dist, target);
        break;
      case 'notice':
        // Stares at him (or where he was) until they make up their mind or lose interest.
        this.stop();
        if (sees) this.turnToward(this.angleTo(target), dt, 6);
        break;
      case 'calm':
        this.hangOut(dt);
        break;
    }
    this.tickChatter(dt);
    return null;
  }

  /** Mr. Gravy caught Dalton: whoever was after him has nothing left to yell about. */
  calmDown(): void {
    const wasAfterHim = this.mind.attention === 'yell' || this.mind.attention === 'follow';
    if (this.mind.attention === 'calm') return;
    calmDown(this.mind, BALANCE.students.ignoreSeconds);
    this.rest();
    if (wasAfterHim) this.bubble.say(pick(STUDENT_LINES.busted), 1.6);
  }

  /** Word got around: say something about it in `delay` seconds (if they're just hanging out then). */
  queueChatter(delay: number): void {
    this.chatterIn = delay;
  }

  /**
   * Puts them at (x, y) looking `facing` (radians), calm, and standing there for `seconds` unless
   * something catches their eye. For tests and debugging.
   */
  standAt(x: number, y: number, facing: number, seconds = Infinity): void {
    this.body.reset(x, y);
    Object.assign(this.mind, newMind());
    this.lastSeen = null;
    this.facing = facing;
    this.rest();
    this.timer = seconds;
  }

  /** Shows a speech bubble (for the scene and tests). */
  say(text: string, seconds: number): void {
    this.bubble.say(text, seconds);
  }

  get saying(): boolean {
    return this.bubble.visible;
  }

  syncView(time: number, view: Phaser.Geom.Rectangle): void {
    const attention = this.mind.attention;
    this.view.update(this.x, this.y, this.facing, this.body.speed > 5, time, {
      pose: attention === 'yell' ? 'yell' : undefined,
    });

    const head = this.y + this.view.headTop;
    // The bubble says it all; otherwise '!' while after him (following, he's in sight), '?' while unsure.
    const lost = attention === 'follow' && this.mind.lostFor > 0;
    const mark = this.bubble.visible ? null : attention === 'yell' || (attention === 'follow' && !lost) ? '!' : attention === 'notice' || lost ? '?' : null;
    this.emote.show(mark, time);
    this.emote.place(this.x, head - 4, time);
    this.bubble.place(this.x, head - 4, view);

    this.cone.clear();
    // Cones are only worth drawing when they can be on screen.
    const cone = this.visionCone;
    const r = cone.range;
    if (this.x + r < view.x || this.x - r > view.right || this.y + r < view.y || this.y - r > view.bottom) return;
    // Graphics only reads x/y from the points.
    const poly = conePolygon(this.world.sight, cone, 20) as Phaser.Math.Vector2[];
    const after = attention === 'yell' || attention === 'follow';
    const color = after ? 0xff6a5a : attention === 'notice' ? 0xffa53d : this.highAlert ? 0xffd06a : 0x9fd8ff;
    // Soft, so the floor art shows through; brighter once they're onto him.
    const alpha = this.mind.ignore > 0 && !after ? 0.04 : after || attention === 'notice' ? 0.16 : 0.1;
    this.cone.fillStyle(color, alpha).fillPoints(poly, true);
    this.cone.lineStyle(2, color, Math.min(0.5, alpha * 2.2)).strokePoints(poly, true);
  }

  destroy(): void {
    this.view.destroy();
    this.emote.destroy();
    this.bubble.destroy();
    this.cone.destroy();
    this.zone.destroy();
  }

  // ---- following ---------------------------------------------------------

  /** Slowly walks to where they last saw him, stopping a little way off while he's in sight. */
  private followPlayer(dt: number, sees: boolean, dist: number, target: Point) {
    if (followHolds(sees, dist, BALANCE.students.followKeepTiles * TILE)) {
      this.stop();
      this.path = [];
      this.turnToward(this.angleTo(target), dt, 8);
      return;
    }
    const goal = this.lastSeen;
    if (!goal) {
      this.stop();
      return;
    }
    if (clearLine(this.world.nav, this, goal, RADIUS)) {
      this.path = [goal];
      // Re-plan as soon as the straight line is blocked.
      this.repathIn = 0;
    } else if ((this.repathIn -= dt) <= 0) {
      this.repathIn = REPATH_SECONDS;
      this.goTo(goal);
    }
    if (this.follow(dt, this.walkSpeed * BALANCE.students.followFactor)) {
      // Got there and he's gone: look around for him.
      this.lookT += dt;
      this.facing += Math.sin(this.lookT * 2.2) * dt * 2.5;
    }
  }

  // ---- hanging out -------------------------------------------------------

  private hangOut(dt: number) {
    const s = BALANCE.students;
    if (this.calm === 'walk') {
      if (this.follow(dt, this.walkSpeed * (this.highAlert ? s.highAlertWalkFactor : 1))) this.rest();
      return;
    }
    this.stop();
    this.timer -= dt;
    // On high alert they look around wider and quicker.
    const look = this.highAlert ? s.highAlertLookFactor : 1;
    this.lookT += dt * look;
    this.facing = this.lookBase + Math.sin(this.lookT * 1.8) * 0.8 * Math.min(1.5, look);
    if (this.timer <= 0) this.wander();
  }

  private tickChatter(dt: number) {
    if (!this.highAlert) {
      this.chatterIn = null;
      return;
    }
    const every = BALANCE.students.chatterEverySeconds;
    if (this.chatterIn === null) this.chatterIn = Phaser.Math.FloatBetween(...every);
    if ((this.chatterIn -= dt) > 0) return;
    this.chatterIn = Phaser.Math.FloatBetween(...every);
    if (this.mind.attention === 'calm' && !this.bubble.visible) this.bubble.say(pick(STUDENT_LINES.chatter), CHATTER_SECONDS);
  }

  /** Stands around for a bit before the next stroll. */
  private rest() {
    const s = BALANCE.students;
    this.calm = 'idle';
    this.path = [];
    this.stop();
    this.timer = Phaser.Math.FloatBetween(...s.pauseSeconds) * (this.highAlert ? s.highAlertPauseFactor : 1);
    this.lookBase = this.facing;
    this.lookT = 0;
  }

  private wander() {
    const here = this.world.nav.toTile(this.x, this.y);
    const tile = pickWanderTarget(this.area, { x: here.tx, y: here.ty }, Math.random);
    if (!tile || !this.goTo(this.world.nav.center(tile.x, tile.y))) {
      this.rest();
      return;
    }
    this.calm = 'walk';
  }

  // ---- walking -----------------------------------------------------------

  /** Returns false when there is no way there. */
  private goTo(p: Point): boolean {
    const nav = this.world.nav;
    const from = nav.toTile(this.x, this.y);
    const to = nav.toTile(p.x, p.y);
    const tiles = findPath(nav, from.tx, from.ty, to.tx, to.ty);
    this.path = tiles ? this.fromHere(smoothPath(nav, tiles, RADIUS)) : [];
    this.stuckCheck = { x: this.x, y: this.y, t: 0 };
    return tiles !== null;
  }

  /**
   * A smoothed path starts at the centre of the student's tile. Skip that only if they can head
   * straight for the next waypoint from where they actually stand: from off-centre (stopped mid-walk
   * to stare, or after a straight run) that first leg can clip a door jamb and grind against it.
   */
  private fromHere(pts: Point[]): Point[] {
    return pts.length > 1 && clearLine(this.world.nav, this, pts[1], RADIUS) ? pts.slice(1) : pts;
  }

  /** Walks along the current path. Returns true when there is nowhere left to go. */
  private follow(dt: number, speed: number): boolean {
    while (this.path.length && this.reached(this.path[0])) {
      this.legFrom = this.path.shift()!;
      this.legTo = this.path[0] ?? null;
    }
    if (!this.path.length) {
      this.stop();
      return true;
    }
    const next = this.path[0];
    const angle = Math.atan2(next.y - this.y, next.x - this.x);
    this.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.turnToward(angle, dt, 9);

    // Snagged on a corner: re-plan to the same goal.
    this.stuckCheck.t += dt;
    if (this.stuckCheck.t > 0.6) {
      const moved = Phaser.Math.Distance.Between(this.x, this.y, this.stuckCheck.x, this.stuckCheck.y);
      const goal = this.path[this.path.length - 1];
      this.stuckCheck = { x: this.x, y: this.y, t: 0 };
      if (moved < speed * 0.15) this.goTo(goal);
    }
    return false;
  }

  /** Close enough, or already past it: at low frame rates one physics step can jump over the 8 px radius. */
  private reached(p: Point): boolean {
    if (p !== this.legTo) {
      this.legTo = p;
      this.legFrom = { x: this.x, y: this.y };
    }
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    return dx * dx + dy * dy < 64 || dx * (p.x - this.legFrom.x) + dy * (p.y - this.legFrom.y) < 0;
  }

  private stop() {
    this.body.setVelocity(0, 0);
  }

  private angleTo(p: Point | null): number {
    return p ? Math.atan2(p.y - this.y, p.x - this.x) : this.facing;
  }

  private turnToward(angle: number, dt: number, rate: number) {
    const delta = Phaser.Math.Angle.Wrap(angle - this.facing);
    this.facing += Phaser.Math.Clamp(delta, -rate * dt, rate * dt);
  }
}
