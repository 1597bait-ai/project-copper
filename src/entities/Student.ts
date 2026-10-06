import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import type { NpcDef } from '../config/npcs';
import { clearLine, findPath, smoothPath, type Point } from '../systems/pathfinding';
import { conePolygon, inCone, type Cone } from '../systems/vision';
import { pickWanderTarget, wanderArea } from '../systems/wander';
import { textStyle } from '../ui/theme';
import type { World } from '../world/World';
import type { Boss } from './Boss';
import { CharacterView } from './CharacterView';
import type { Player } from './Player';

const RADIUS = TILE * 0.28;
/** Students are drawn a bit smaller than the grown-ups. */
const SCALE = 0.86;
/** Mr. Gravy keeps moving, so the route to him is re-planned this often (seconds). */
const REPATH_SECONDS = 0.5;
/** Failed route searches in a row before a student gives up on telling. */
const MAX_FAILED_PATHS = 3;
/** Speech bubbles wrap at this width (world px) so they still fit on a zoomed-in phone screen. */
const BUBBLE_WRAP = 300;
const INK = 0x1b1d24;

const REPORT_LINES = ["That guy's stealing pipes!", 'Mr. Gravy! Someone has a bag full of copper!', "He's ripping stuff off the walls!"];

export type StudentState = 'idle' | 'walk' | 'notice' | 'tattle' | 'report';

/** Things the scene reacts to with sounds and toasts. */
export type StudentEvent = 'saw' | 'reported';

/**
 * A student hanging around the halls. Ignores you unless you're carrying scrap or scrapping in
 * front of them; then they run and tell Mr. Gravy, who sprints to where you were seen.
 *
 *   idle (looks around) <-> walk (strolls somewhere nearby)
 *   sees you with scrap: notice (stares, suspicion fills) -> tattle (shouts, runs to Mr. Gravy)
 *     -> report (tells him) -> idle, ignoring you for a while
 */
export class Student {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly view: CharacterView;
  private readonly mark: Phaser.GameObjects.Text;
  private readonly cone: Phaser.GameObjects.Graphics;
  /** Sits on the student; holds the tail and the body, which slides sideways to stay on screen. */
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleBody: Phaser.GameObjects.Container;
  private readonly bubbleBg: Phaser.GameObjects.Graphics;
  private readonly bubbleText: Phaser.GameObjects.Text;
  private bubbleWidth = 0;
  /** -1/1 leans the bubble left/right of its tail (away from Mr. Gravy's '!' while telling him); 0 centres it. */
  private bubbleLean = 0;

  state: StudentState = 'idle';
  suspicion = 0;
  facing = Math.random() * Math.PI * 2;
  /** Where the player was when this student caught them. */
  reportPoint: Point | null = null;
  private path: Point[] = [];
  private timer = Phaser.Math.FloatBetween(...BALANCE.students.pauseSeconds);
  private lookT = 0;
  private lookBase = this.facing;
  private ignore = 0;
  private repathIn = 0;
  private failedPaths = 0;
  private tattleT = 0;
  private bubbleLeft = 0;
  private stuckCheck = { x: 0, y: 0, t: 0 };
  /** The waypoint being walked to and where that leg started, to notice overshooting it. */
  private legTo: Point | null = null;
  private legFrom: Point = { x: 0, y: 0 };
  /** Tiles this student strolls between (see systems/wander.ts). */
  private readonly area: Point[];
  private readonly range = BALANCE.students.visionRangeTiles * TILE;
  private readonly halfAngle = Phaser.Math.DegToRad(BALANCE.students.visionHalfAngleDeg);
  private readonly walkSpeed: number;
  private readonly runSpeed: number;

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
    this.cone = scene.add.graphics().setDepth(7);
    this.view = new CharacterView(scene, looks[index % looks.length], x, y, { scale: SCALE });
    this.mark = scene.add
      .text(x, y, '', { fontFamily: 'Arial Black, Arial', fontSize: '48px', color: '#ffa53d', stroke: '#14161c', strokeThickness: 7 })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, '', textStyle(26, '#1b1d24', { strokeThickness: 0, align: 'center', wordWrap: { width: BUBBLE_WRAP } }))
      .setOrigin(0.5);
    this.bubbleBody = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText]);
    const tail = scene.add
      .graphics()
      .fillStyle(0xffffff, 1)
      .fillTriangle(-9, -2, 9, -2, 0, 12)
      .lineStyle(3, INK, 1)
      .lineBetween(-9, 0, 0, 12)
      .lineBetween(0, 12, 9, 0);
    // Under the '?'/'!' marks, so a bubble never hides Mr. Gravy's state.
    this.bubble = scene.add.container(x, y, [this.bubbleBody, tail]).setDepth(19).setVisible(false);

    const speed = BALANCE.tilesPerSecond(def.speed) * TILE;
    this.walkSpeed = speed * BALANCE.students.walkFactor;
    this.runSpeed = speed * BALANCE.students.runFactor;

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

  get visionCone(): Cone {
    return { origin: { x: this.x, y: this.y }, facing: this.facing, range: this.range, halfAngle: this.halfAngle };
  }

  /** Runs the AI for one frame. Returns what happened, if the scene should react. */
  update(dt: number, player: Player, boss: Boss): StudentEvent | null {
    this.ignore = Math.max(0, this.ignore - dt);
    if (this.bubbleLeft > 0 && (this.bubbleLeft -= dt) <= 0) this.bubble.setVisible(false);

    if (this.state === 'tattle') return this.runToBoss(dt, boss);
    if (this.state === 'report') {
      this.stop();
      this.turnToward(Math.atan2(boss.y - this.y, boss.x - this.x), dt, 6);
      if ((this.timer -= dt) <= 0) this.forget();
      return null;
    }

    const target = { x: player.x, y: player.y };
    if (this.ignore <= 0 && player.suspicious && inCone(this.world.sight, this.visionCone, target)) {
      const { noticeSecondsNear: near, noticeSecondsFar: far } = BALANCE.students;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      this.suspicion = Math.min(1, this.suspicion + dt / (near + (far - near) * Math.min(1, dist / this.range)));
      this.state = 'notice';
      this.stop();
      this.turnToward(Math.atan2(target.y - this.y, target.x - this.x), dt, 6);
      if (this.suspicion >= 1) {
        this.startTattle(target);
        return 'saw';
      }
      return null;
    }

    this.suspicion = Math.max(0, this.suspicion - BALANCE.students.suspicionDecay * dt);
    switch (this.state) {
      case 'notice':
        // Keeps staring at where you were until they lose interest.
        this.stop();
        if (this.suspicion <= 0) this.rest();
        break;
      case 'walk':
        if (this.follow(dt, this.walkSpeed)) this.rest();
        break;
      case 'idle':
        this.stop();
        this.timer -= dt;
        this.lookT += dt;
        this.facing = this.lookBase + Math.sin(this.lookT * 1.8) * 0.8;
        if (this.timer <= 0) this.wander();
        break;
    }
    return null;
  }

  syncView(time: number, view: Phaser.Geom.Rectangle): void {
    this.view.update(this.x, this.y, this.facing, this.body.speed > 5, time, { running: this.state === 'tattle' });

    const telling = this.state === 'tattle' || this.state === 'report';
    const noticing = this.state === 'notice';
    this.mark.setText(this.bubble.visible ? '' : telling ? '!' : noticing ? '?' : '');
    const head = this.y + this.view.headTop;
    this.mark.setPosition(this.x, head + 2 + Math.sin(time / 110) * 4);
    this.bubble.setPosition(this.x, head - 12);
    if (this.bubble.visible) {
      // Slide the body sideways to keep it on screen (phones zoom in a lot), but never off its tail.
      const half = this.bubbleWidth / 2;
      const slack = half - 22;
      const onScreen = Phaser.Math.Clamp(this.x + this.bubbleLean * slack, view.x + half + 8, view.right - half - 8);
      this.bubbleBody.x = Phaser.Math.Clamp(onScreen - this.x, -slack, slack);
    }

    this.cone.clear();
    // Cones are only worth drawing when they can be on screen.
    const r = this.range;
    const onScreen = this.x + r >= view.x && this.x - r <= view.right && this.y + r >= view.y && this.y - r <= view.bottom;
    if (telling || !onScreen) return;
    // Graphics only reads x/y from the points.
    const poly = conePolygon(this.world.sight, this.visionCone, 18) as Phaser.Math.Vector2[];
    const color = noticing ? 0xffa53d : 0x9fd8ff;
    const alpha = this.ignore > 0 ? 0.05 : noticing ? 0.24 : 0.12;
    this.cone.fillStyle(color, alpha).fillPoints(poly, true);
    this.cone.lineStyle(2, color, alpha * 1.8).strokePoints(poly, true);
  }

  private startTattle(seen: Point) {
    this.reportPoint = { ...seen };
    this.suspicion = 0;
    this.state = 'tattle';
    this.tattleT = 0;
    this.timer = BALANCE.students.shoutSeconds;
    this.failedPaths = 0;
    this.repathIn = 0;
    this.path = [];
    this.stop();
    this.say('MR. GRAVY!!', 1.4);
  }

  private runToBoss(dt: number, boss: Boss): StudentEvent | null {
    this.tattleT += dt;
    if (this.timer > 0) {
      this.timer -= dt;
      return null;
    }
    const at = { x: boss.x, y: boss.y };
    if (Phaser.Math.Distance.Between(this.x, this.y, at.x, at.y) < BALANCE.students.reportRangeTiles * TILE) {
      return this.report(boss);
    }
    if (this.tattleT > BALANCE.students.giveUpSeconds) {
      this.forget();
      return null;
    }
    if (clearLine(this.world.nav, this, at, RADIUS)) {
      this.path = [at];
      // Re-plan as soon as he goes out of sight.
      this.repathIn = 0;
    } else if ((this.repathIn -= dt) <= 0) {
      this.repathIn = REPATH_SECONDS;
      if (this.goTo(at)) this.failedPaths = 0;
      else if (++this.failedPaths >= MAX_FAILED_PATHS) {
        this.forget();
        return null;
      }
    }
    this.follow(dt, this.runSpeed);
    return null;
  }

  private report(boss: Boss): StudentEvent | null {
    this.stop();
    this.path = [];
    this.state = 'report';
    this.timer = BALANCE.students.reportPauseSeconds;
    this.say(Phaser.Utils.Array.GetRandom(REPORT_LINES), BALANCE.students.reportPauseSeconds + 0.4, Math.sign(this.x - boss.x));
    return this.reportPoint && boss.respondTo(this.reportPoint, this.tattleT) ? 'reported' : null;
  }

  /** Mr. Gravy just caught the player, so whoever was running to tell him has nothing left to tell. */
  cancelReport(): void {
    if (this.state === 'tattle') this.forget();
  }

  /** Done telling (or gave up): back to hanging out, and leave the player alone for a while. */
  private forget() {
    this.reportPoint = null;
    this.ignore = BALANCE.students.ignoreSeconds;
    this.rest();
  }

  private rest() {
    this.state = 'idle';
    this.path = [];
    this.stop();
    this.timer = Phaser.Math.FloatBetween(...BALANCE.students.pauseSeconds);
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
    this.state = 'walk';
  }

  private say(text: string, seconds: number, lean = 0) {
    this.bubbleLean = lean;
    this.bubbleText.setText(text);
    const w = this.bubbleText.width + 26;
    const h = this.bubbleText.height + 14;
    this.bubbleWidth = w;
    this.bubbleText.setPosition(0, -h / 2);
    this.bubbleBg
      .clear()
      .fillStyle(0xffffff, 1)
      .fillRoundedRect(-w / 2, -h, w, h, 12)
      .lineStyle(3, INK, 1)
      .strokeRoundedRect(-w / 2, -h, w, h, 12);
    this.bubble.setVisible(true);
    this.bubbleLeft = seconds;
  }

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

  private turnToward(angle: number, dt: number, rate: number) {
    const delta = Phaser.Math.Angle.Wrap(angle - this.facing);
    this.facing += Phaser.Math.Clamp(delta, -rate * dt, rate * dt);
  }
}
