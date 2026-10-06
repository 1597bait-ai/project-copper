import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import type { NpcDef } from '../config/npcs';
import { clearLine, findPath, smoothPath, type Point } from '../systems/pathfinding';
import { conePolygon, inCone, type Cone } from '../systems/vision';
import type { World } from '../world/World';
import type { Player } from './Player';

const RADIUS = TILE * 0.3;

export type BossState = 'patrol' | 'pause' | 'alert' | 'chase' | 'search' | 'return' | 'respond';

/**
 * Mr. Gravy. Walks a patrol route from the map, looks around at each stop, and gets
 * suspicious when the player is in his vision cone while carrying or scrapping.
 *
 *   patrol -> pause -> patrol ...
 *   sees you: alert (stares, suspicion fills) -> chase -> caught
 *   loses you: search (goes to last seen spot, looks around) -> return -> patrol
 *   a student tells on you: respond (sprints to where you were seen) -> search -> return
 */
export class Boss {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  private readonly view: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly mark: Phaser.GameObjects.Text;
  private readonly cone: Phaser.GameObjects.Graphics;

  state: BossState = 'pause';
  suspicion = 0;
  facing = Math.PI / 2;
  speedMultiplier = 1;
  private path: Point[] = [];
  private waypoint = -1;
  private lookT = 0;
  private timer = 0.8;
  private lookBase = Math.PI / 2;
  private lastSeen: Point | null = null;
  private grace = 0;
  /** How old (seconds) his latest news of the player is: his own sighting, a catch, or a report he acted on. */
  private newsAge = Infinity;
  private repathIn = 0;
  private stuckCheck = { x: 0, y: 0, t: 0 };
  /** The waypoint being walked to and where that leg started, to notice overshooting it. */
  private legTo: Point | null = null;
  private legFrom: Point = { x: 0, y: 0 };
  private readonly range: number;
  private readonly halfAngle: number;
  private readonly chaseSpeed: number;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    readonly def: NpcDef,
  ) {
    const { x, y } = world.bossSpawn;
    this.zone = scene.add.zone(x, y, RADIUS * 2, RADIUS * 2);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(RADIUS);
    this.body.setCollideWorldBounds(true);

    this.cone = scene.add.graphics().setDepth(7);
    this.shadow = scene.add.image(x, y + 6, 'shadow').setDepth(9);
    this.sprite = scene.add.image(0, 0, def.sprite);
    this.view = scene.add.container(x, y, [this.sprite]).setDepth(11);
    this.mark = scene.add
      .text(x, y, '', { fontFamily: 'Arial Black, Arial', fontSize: '56px', color: '#ffd23d', stroke: '#14161c', strokeThickness: 8 })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.range = BALANCE.boss.visionRangeTiles(def.awareness) * TILE;
    this.halfAngle = Phaser.Math.DegToRad(BALANCE.boss.visionHalfAngleDeg(def.awareness));
    this.chaseSpeed = BALANCE.tilesPerSecond(def.speed) * TILE;
  }

  get x(): number {
    return this.zone.x;
  }

  get y(): number {
    return this.zone.y;
  }

  get visionCone(): Cone {
    return { origin: { x: this.x, y: this.y }, facing: this.facing, range: this.range, halfAngle: this.halfAngle };
  }

  /** Runs the AI for one frame. Returns true if the player just got caught. */
  update(dt: number, player: Player): boolean {
    this.grace = Math.max(0, this.grace - dt);
    this.newsAge += dt;
    const target = { x: player.x, y: player.y };
    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    const sees = this.grace <= 0 && player.suspicious && inCone(this.world.sight, this.visionCone, target);

    if (sees) {
      const near = BALANCE.boss.noticeSecondsNear;
      const far = BALANCE.boss.noticeSecondsFar;
      const secondsToCatch = (near + (far - near) * Math.min(1, dist / this.range)) * (2 / this.def.awareness);
      this.suspicion = Math.min(1, this.suspicion + dt / secondsToCatch);
      this.lastSeen = target;
      this.newsAge = 0;
      if (this.suspicion >= 1) return true;
      if (this.state !== 'chase') this.setState(this.suspicion >= BALANCE.boss.chaseAt ? 'chase' : 'alert');
    } else {
      this.suspicion = Math.max(0, this.suspicion - BALANCE.boss.suspicionDecay * dt);
      if ((this.state === 'alert' || this.state === 'chase') && this.lastSeen) {
        this.setState('search');
        this.goTo(this.lastSeen);
        this.timer = BALANCE.boss.searchSeconds;
      }
    }

    if (this.state === 'chase' && player.suspicious && this.grace <= 0 && dist < BALANCE.boss.catchRangeTiles * TILE + RADIUS) {
      return true;
    }

    const speed = this.chaseSpeed * this.speedMultiplier;
    switch (this.state) {
      case 'patrol':
      case 'return':
        if (this.follow(dt, speed * BALANCE.boss.patrolFactor)) {
          this.setState('pause');
          this.timer = Phaser.Math.FloatBetween(...BALANCE.boss.waypointPause);
          this.lookBase = this.facing;
          this.lookT = 0;
        }
        break;
      case 'pause':
        this.stop();
        this.timer -= dt;
        this.lookT += dt;
        this.facing = this.lookBase + Math.sin(this.lookT * 2.4) * 0.9;
        if (this.timer <= 0) this.nextWaypoint();
        break;
      case 'alert':
        this.stop();
        this.turnToward(Math.atan2(target.y - this.y, target.x - this.x), dt, 7);
        break;
      case 'chase':
        if (clearLine(this.world.nav, this, target, RADIUS)) {
          this.path = [target];
        } else if ((this.repathIn -= dt) <= 0) {
          this.goTo(target);
          this.repathIn = 0.4;
        }
        this.follow(dt, speed);
        break;
      case 'respond':
        if (this.follow(dt, speed * BALANCE.boss.sprintFactor)) {
          this.setState('search');
          this.timer = BALANCE.boss.respondSearchSeconds;
        }
        break;
      case 'search':
        if (this.follow(dt, speed * 0.8)) {
          this.stop();
          this.timer -= dt;
          this.facing += dt * 2.6;
          if (this.timer <= 0) this.returnToRoute();
        }
        break;
    }
    return false;
  }

  /**
   * A student reports seeing the player at `point`, `age` seconds ago: he sprints there and searches.
   * Ignored while he is chasing or in his post-warning grace, and when it is older than what he
   * already knows (he has seen or caught the player since). Returns true if he is on his way.
   */
  respondTo(point: Point, age: number): boolean {
    if (this.state === 'chase' || this.grace > 0 || age >= this.newsAge) return false;
    this.newsAge = age;
    this.lastSeen = { ...point };
    this.setState('respond');
    this.goTo(point);
    return true;
  }

  /** After handing out a warning he ignores the player for a moment and goes back to his route. */
  afterCatch(): void {
    this.suspicion = 0;
    this.grace = BALANCE.graceSeconds;
    this.newsAge = 0;
    this.lastSeen = null;
    this.returnToRoute();
  }

  syncView(time: number): void {
    this.view.setPosition(this.x, this.y);
    this.shadow.setPosition(this.x, this.y + 6);
    this.sprite.rotation = this.facing;
    const walking = this.body.speed > 5;
    this.sprite.setScale(walking ? 1 + Math.sin(time / 90) * 0.03 : 1);

    const chasing = this.state === 'chase';
    const responding = this.state === 'respond';
    const curious = this.state === 'alert' || this.state === 'search';
    this.mark.setText(chasing || responding ? '!' : curious ? '?' : '');
    this.mark.setColor(chasing ? '#ff4d3d' : responding ? '#ffa53d' : '#ffd23d');
    this.mark.setPosition(this.x, this.y - 40 + Math.sin(time / 120) * 4);

    // Graphics only reads x/y from the points.
    const poly = conePolygon(this.world.sight, this.visionCone) as Phaser.Math.Vector2[];
    const color = chasing ? 0xff4d3d : this.suspicion > 0 || curious || responding ? 0xffa53d : 0xfff1a8;
    const alpha = this.grace > 0 ? 0.08 : chasing ? 0.3 : responding ? 0.26 : 0.2;
    this.cone.clear();
    this.cone.fillStyle(color, alpha).fillPoints(poly, true);
    this.cone.lineStyle(3, color, alpha * 2).strokePoints(poly, true);
  }

  private setState(state: BossState) {
    this.state = state;
  }

  private nextWaypoint() {
    if (this.world.patrol.length === 0) {
      this.timer = 2;
      this.lookBase = this.facing;
      this.lookT = 0;
      return;
    }
    this.waypoint = (this.waypoint + 1) % this.world.patrol.length;
    this.setState('patrol');
    this.goTo(this.world.patrol[this.waypoint]);
  }

  private returnToRoute() {
    if (this.world.patrol.length === 0) {
      this.setState('pause');
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    this.world.patrol.forEach((p, i) => {
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d < bestDist) [best, bestDist] = [i, d];
    });
    this.waypoint = best;
    this.setState('return');
    this.goTo(this.world.patrol[best]);
  }

  private goTo(p: Point) {
    const nav = this.world.nav;
    const from = nav.toTile(this.x, this.y);
    const to = nav.toTile(p.x, p.y);
    const tiles = findPath(nav, from.tx, from.ty, to.tx, to.ty);
    this.path = tiles ? this.fromHere(smoothPath(nav, tiles, RADIUS)) : [];
    // Finish on the exact point when it is reachable (e.g. the player's last seen position).
    if (tiles && !nav.blockedAtWorld(p.x, p.y) && this.path.length) this.path[this.path.length - 1] = { ...p };
    this.stuckCheck = { x: this.x, y: this.y, t: 0 };
  }

  /**
   * A smoothed path starts at the centre of his tile. Skip that only if he can head straight for the
   * next waypoint from where he actually stands: an off-centre start can clip a door jamb on the way.
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

    // If something knocks him off the path (a corner, the player), re-plan.
    this.stuckCheck.t += dt;
    if (this.stuckCheck.t > 0.6) {
      const moved = Phaser.Math.Distance.Between(this.x, this.y, this.stuckCheck.x, this.stuckCheck.y);
      const goal = this.path[this.path.length - 1];
      this.stuckCheck = { x: this.x, y: this.y, t: 0 };
      if (moved < speed * 0.15) this.goTo(goal);
    }
    return false;
  }

  /** Close enough, or already past it: at low frame rates (or sprinting) one physics step can jump over the 8 px radius. */
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
