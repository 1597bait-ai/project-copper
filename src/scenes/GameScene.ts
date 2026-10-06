import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { CHARACTERS, type CharacterDef } from '../config/characters';
import { MATERIALS, MATERIAL_ORDER } from '../config/materials';
import { COWORKER_LINES, GRAVY_LINES, NPCS } from '../config/npcs';
import { Boss } from '../entities/Boss';
import type { Door } from '../entities/Door';
import type { Fixture } from '../entities/Fixture';
import { Player } from '../entities/Player';
import { SleepyCoworker, type CoworkerEvent } from '../entities/SleepyCoworker';
import { Student, type StudentYell } from '../entities/Student';
import { controls } from '../input/Controls';
import { AlertTimer } from '../systems/alert';
import { mergeContents, roundMoney, saleValue, type ScrapContents } from '../systems/Bag';
import { clockText } from '../systems/clock';
import { besideDesk, coworkerLine, coworkerWakes } from '../systems/coworker';
import { effectiveRepair, rollRecharge, rollYield, scrapSeconds } from '../systems/scrapping';
import { sfx } from '../systems/sfx';
import { chatterDelays, hearsYell } from '../systems/studentMind';
import { cssPerGamePixel, isPortrait, isTouchDevice, money, textStyle } from '../ui/theme';
import { parseMap } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';
import { validateMap } from '../world/validate';
import { World } from '../world/World';

export interface GameInit {
  character?: string;
  /** Text of the map to play (from the map editor). Defaults to the built-in school. */
  mapText?: string;
}

export interface ShiftSummary {
  fired: boolean;
  earned: number;
  sold: ScrapContents;
  lost: ScrapContents;
  warnings: number;
  character: string;
  /** Paid by the sleepy coworker to keep quiet (already included in `earned`). */
  hushMoney: number;
  /** Set when the shift was played on a custom map, so "next shift" stays on it. */
  mapText?: string;
}

type Target = { kind: 'fixture'; fixture: Fixture } | { kind: 'door'; door: Door };

/** Everything the HUD needs, refreshed every frame. */
export interface HudState {
  money: number;
  bagTotal: number;
  bagCapacity: number;
  bagContents: ScrapContents;
  warnings: number;
  maxWarnings: number;
  clock: string;
  progress: number;
  location: string;
  /** Short verb for the action button ("SCRAP", "UNLOCK", "STOP"), or null when nothing to do. */
  action: string | null;
  /** Longer description of what the action button will do. */
  prompt: string | null;
  promptBad: boolean;
  ability: { name: string; key: string; activeLeft: number; duration: number; cooldownLeft: number; cooldown: number } | null;
  danger: number;
  characterName: string;
  /** Word got around after a student reported you: every student is on high alert until it runs out. */
  alert: { left: number; total: number } | null;
}

/** A line of dialog shown in the HUD's dialog box (emitted as the 'dialog' event). */
export interface DialogLine {
  speaker: string;
  text: string;
  /** How long it stays up (a tap or the action key closes it sooner). */
  seconds: number;
  /** Texture key of a portrait, e.g. 'sleepy_coworker_big'. */
  portrait?: string;
}

export class GameScene extends Phaser.Scene {
  world!: World;
  player!: Player;
  boss!: Boss;
  students: Student[] = [];
  hud!: HudState;

  private characterId = 'dalton';
  /** Custom map text, or undefined for the built-in map. */
  mapText: string | undefined;
  private elapsed = 0;
  private earned = 0;
  private warnings = 0;
  private sold: ScrapContents = {};
  private lost: ScrapContents = {};
  private target: Target | null = null;
  private coffeeDone = false;
  private lastCallDone = false;
  private over = false;
  private ending = false;
  private wasChasing = false;
  /** Word got around after a student's yell reached Mr. Gravy: every student is on high alert. */
  readonly alert = new AlertTimer();
  /** The sleepy coworker while he's around (one at a time). */
  coworker: SleepyCoworker | null = null;
  /**
   * Chance he's under a desk you finish scrapping (from BALANCE each shift). Tests set it to 1;
   * wakeSleepyCoworker() skips the roll altogether.
   */
  coworkerChance: number = BALANCE.sleepyCoworker.chance;
  private coworkersMet = 0;
  private hushMoney = 0;
  /** Shift time each kind of toast last showed, so a crowd of yelling students doesn't spam. */
  private toastAt: Record<string, number> = {};
  private channelBar!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private padPrev = { a: false, x: false, b: false, start: false };
  private scrapTick = 0;
  private onVisibility = () => {
    if (document.hidden) this.pauseGame();
  };

  constructor() {
    super('Game');
  }

  init(data: GameInit): void {
    this.characterId = data.character && CHARACTERS[data.character] ? data.character : 'dalton';
    this.mapText = data.mapText;
    this.elapsed = 0;
    this.earned = 0;
    this.warnings = 0;
    this.sold = {};
    this.lost = {};
    this.target = null;
    this.coffeeDone = false;
    this.lastCallDone = false;
    this.over = false;
    this.ending = false;
    this.wasChasing = false;
    this.students = [];
    this.toastAt = {};
    this.alert.stop();
    this.coworker = null;
    this.coworkerChance = BALANCE.sleepyCoworker.chance;
    this.coworkersMet = 0;
    this.hushMoney = 0;
    controls.reset();
  }

  create(): void {
    const character: CharacterDef = CHARACTERS[this.characterId];
    let map = parseMap(this.mapText ?? DEFAULT_MAP.text);
    let report = validateMap(map);
    if (report.errors.length && this.mapText !== undefined) {
      // Never strand the player on a broken custom map: fall back to the built-in school.
      const problem = report.errors[0];
      console.warn('Map has problems, playing the built-in map instead:', report.errors);
      this.mapText = undefined;
      map = parseMap(DEFAULT_MAP.text);
      report = validateMap(map);
      this.time.delayedCall(800, () => this.toast(`That map can't be played yet: ${problem}`, '#ffc23d', 5000));
    }
    if (report.errors.length) {
      // The built-in map itself is broken (only while someone is hand-editing it): say so instead of crashing.
      console.error('The built-in map has problems:', report.errors);
      this.over = true;
      this.scene.start('Menu', { notice: `The map can't be played: ${report.errors[0]}` });
      return;
    }
    this.world = new World(this, map);
    this.physics.world.setBounds(0, 0, this.world.width, this.world.height);

    this.player = new Player(this, this.world.playerSpawn.x, this.world.playerSpawn.y, character);
    this.boss = new Boss(this, this.world, NPCS.mr_gravy);
    this.students = this.world.studentSpawns.map((spawn, i) => new Student(this, this.world, NPCS.student, spawn, i));

    // Students walk through the player, Mr. Gravy and each other; only walls and solid things stop them.
    for (const body of [this.player.zone, this.boss.zone, ...this.students.map((s) => s.zone)]) {
      this.physics.add.collider(body, this.world.walls);
      this.physics.add.collider(body, this.world.solids);
    }

    this.channelBar = this.add.graphics().setDepth(25);

    const cam = this.cameras.main;
    cam.startFollow(this.player.zone, true, 0.12, 0.12);
    cam.setBackgroundColor('#14161c');
    cam.fadeIn(400, 20, 22, 28);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    // Presses are event-driven so quick taps are never lost, even at low frame rates.
    const bind = (keys: string[], press: 'action' | 'ability' | 'pause') =>
      keys.forEach((k) => kb.on(`keydown-${k}`, (e: KeyboardEvent) => !e.repeat && controls.press(press)));
    bind(['E', 'SPACE', 'ENTER'], 'action');
    bind(['Q', 'SHIFT'], 'ability');
    bind(['ESC', 'P'], 'pause');

    this.hud = this.buildHudState();
    this.scene.launch('Hud');
    this.scene.bringToTop('Hud');

    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncViews, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncViews, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });

    this.time.delayedCall(600, () =>
      this.toast(`7:00 AM — fill your bag, get it to the van. Don't let ${NPCS.mr_gravy.name} see you with scrap!`, '#f6f1e5', 4200),
    );
  }

  update(_time: number, deltaMs: number): void {
    if (this.over) return;
    // Same clock as Arcade physics (Phaser already caps and smooths the frame delta), so on a slow
    // device timers and movement stay in step instead of NPCs out-running the shift clock.
    const dt = deltaMs / 1000;

    const input = this.readInput();
    if (input.pause) {
      this.pauseGame();
      return;
    }

    this.tickShift(dt);
    if (this.over) return;

    const p = this.player;
    if (input.ability && p.ability) {
      if (p.useAbility()) {
        sfx.ability();
        this.floatText(p.x, p.y - 50, p.ability.name + '!', '#c9a7ff');
      } else {
        sfx.denied();
      }
    }

    // Moving cancels whatever you were working on.
    if (p.channel && Math.hypot(input.moveX, input.moveY) > 0.3) {
      p.channel = null;
      this.floatText(p.x, p.y - 50, 'Stopped', '#aab2bf');
    }
    p.move(input.moveX, input.moveY);
    p.update(dt);

    if (p.isScrapping && (this.scrapTick -= dt) <= 0) {
      sfx.scrapTick();
      this.scrapTick = 0.28;
    }

    if (!p.channel) this.pickTarget();
    if (input.action) this.doAction();

    this.checkVan();

    if (this.boss.update(dt, p)) this.caught();
    const chasing = this.boss.state === 'chase';
    if (chasing && !this.wasChasing) sfx.spotted();
    this.wasChasing = chasing;

    // Once fired, nobody walks off during the "you're fired" beat.
    if (!this.over) {
      if (this.alert.tick(dt)) {
        sfx.calm();
        this.toast('The students calmed down. High alert is over.', '#9fd8ff');
      }
      this.updateStudents(dt);
      this.updateCoworker(dt);
    }

    for (const f of this.world.fixtures) f.update(dt);
    this.refreshHud();
  }

  // ---- input -------------------------------------------------------------

  private readInput() {
    const k = this.keys;
    let moveX = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let moveY = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    let action = false;
    let ability = false;
    let pause = false;

    const pad = this.input.gamepad?.pad1;
    if (pad) {
      const sx = pad.leftStick.x;
      const sy = pad.leftStick.y;
      if (Math.hypot(sx, sy) > 0.2) [moveX, moveY] = [sx, sy];
      if (pad.left) moveX = -1;
      if (pad.right) moveX = 1;
      if (pad.up) moveY = -1;
      if (pad.down) moveY = 1;
      const now = { a: pad.A, x: pad.X, b: pad.B, start: pad.isButtonDown(9) };
      action ||= now.a && !this.padPrev.a;
      ability ||= (now.x && !this.padPrev.x) || (now.b && !this.padPrev.b);
      pause ||= now.start && !this.padPrev.start;
      this.padPrev = now;
    }

    const t = controls.touchMove;
    if (Math.hypot(t.x, t.y) > 0.15) [moveX, moveY] = [t.x, t.y];
    action = controls.consume('action') || action;
    ability = controls.consume('ability') || ability;
    pause = controls.consume('pause') || pause;

    const len = Math.hypot(moveX, moveY);
    if (len > 1) [moveX, moveY] = [moveX / len, moveY / len];
    return { moveX, moveY, action, ability, pause };
  }

  // ---- shift / rules -----------------------------------------------------

  private tickShift(dt: number) {
    const { shift } = BALANCE;
    this.elapsed += dt;
    const progress = this.elapsed / shift.lengthSeconds;
    if (!this.coffeeDone && progress >= shift.bossSpeedUpAt) {
      this.coffeeDone = true;
      this.boss.speedMultiplier = shift.bossSpeedUpMultiplier;
      sfx.coffee();
      this.toast(`${NPCS.mr_gravy.name} finished his coffee. He's faster now!`, '#ffc23d');
    }
    if (!this.lastCallDone && progress >= shift.lastCallAt) {
      this.lastCallDone = true;
      this.toast('Shift almost over — get your scrap to the van!', '#ffc23d');
    }
    if (progress >= 1) this.endShift(false);
  }

  private caught() {
    const p = this.player;
    this.warnings++;
    p.channel = null;
    const taken = p.bag.takeAll();
    mergeContents(this.lost, taken);
    this.boss.afterCatch();
    // Nothing left to yell about.
    for (const s of this.students) s.calmDown();
    sfx.warning();
    this.cameras.main.shake(250, 0.008);
    this.cameras.main.flash(200, 255, 60, 40);
    const lines = GRAVY_LINES.caught;
    this.boss.say(lines[Math.min(this.warnings, lines.length) - 1], 2.4);
    if (this.warnings >= BALANCE.warningsUntilFired) {
      this.toast("THREE WARNINGS — YOU'RE FIRED!", '#ff5a4f', 2500);
      this.over = true;
      this.freezeActors();
      this.time.delayedCall(1600, () => this.endShift(true));
    } else {
      const lostValue = saleValue(taken);
      this.toast(
        `WARNING ${this.warnings} of ${BALANCE.warningsUntilFired}${lostValue > 0 ? ` — he took ${money(lostValue)} of scrap` : ''}`,
        '#ff5a4f',
      );
    }
  }

  private endShift(fired: boolean) {
    if (this.ending) return;
    this.ending = true;
    this.over = true;
    this.freezeActors();
    if (!fired && !this.player.bag.isEmpty) mergeContents(this.lost, this.player.bag.takeAll());
    fired ? sfx.fired() : sfx.shiftOver();
    const summary: ShiftSummary = {
      fired,
      earned: roundMoney(this.earned),
      sold: this.sold,
      lost: this.lost,
      warnings: this.warnings,
      character: this.characterId,
      hushMoney: this.hushMoney,
      mapText: this.mapText,
    };
    this.cameras.main.fadeOut(500, 20, 22, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Hud');
      this.scene.start('ShiftEnd', summary);
    });
  }

  /** Stops everyone in place; nothing updates them once the shift is over. */
  private freezeActors() {
    for (const a of [this.player, this.boss, ...this.students]) a.body.setVelocity(0, 0);
  }

  // ---- students ----------------------------------------------------------

  private updateStudents(dt: number) {
    const ctx = { highAlert: this.alert.active };
    for (const s of this.students) {
      const yell = s.update(dt, this.player, ctx);
      if (yell) this.onYell(s, yell);
    }
  }

  /**
   * A student yelled for Mr. Gravy. If he's close enough to hear it, he sprints to where they saw
   * Dalton (every yell he hears moves him to the newest spot), and that counts as a report: word
   * gets around and every student goes on high alert.
   */
  private onYell(s: Student, yell: StudentYell) {
    sfx.yell();
    const boss = this.boss;
    if (!hearsYell(s, boss, BALANCE.students.yellHearingTiles * TILE)) {
      this.throttledToast('unheard', 'A student is yelling for Mr. Gravy!', '#ffc23d');
      return;
    }
    const wasResponding = boss.state === 'respond';
    if (boss.respondTo(yell.seen) && !wasResponding) {
      sfx.report();
      boss.say(GRAVY_LINES.heard[Math.floor(Math.random() * GRAVY_LINES.heard.length)], 1.4);
      // Short enough for one line on a portrait phone: the HUD stacks toasts one line apart.
      this.throttledToast('heard', `${NPCS.mr_gravy.name} heard! He's on his way!`, '#ff8a5a');
    }
    this.raiseAlarm(s);
  }

  /**
   * Starts (or restarts) the high alert. When it's news, the students start talking about it, the
   * ones nearest `from` (where the yell came from) first. Public so tests can set it off.
   */
  raiseAlarm(from: { x: number; y: number } = this.player): void {
    const s = BALANCE.students;
    if (!this.alert.start(s.highAlertSeconds)) return;
    sfx.alert();
    this.toast('Word got around: the students are on HIGH ALERT!', '#ff8a5a', 3400);
    const dist = this.students.map((st) => Phaser.Math.Distance.Between(st.x, st.y, from.x, from.y));
    const delays = chatterDelays(dist, s.chatterGapSeconds, s.chatterJitterSeconds, Math.random);
    // A short beat first, so the yell itself is heard before the chatter.
    this.students.forEach((st, i) => st.queueChatter(0.8 + delays[i]));
  }

  /** A toast that shows at most once every few seconds per `kind`. */
  private throttledToast(kind: string, text: string, color: string) {
    const last = this.toastAt[kind];
    if (last !== undefined && this.elapsed - last < BALANCE.students.toastCooldownSeconds) return;
    this.toastAt[kind] = this.elapsed;
    this.toast(text, color);
  }

  // ---- the sleepy coworker -----------------------------------------------

  /** Dalton just finished scrapping `f`: if it's a desk, maybe the coworker was napping under it. */
  private maybeWakeCoworker(f: Fixture) {
    const c = BALANCE.sleepyCoworker;
    if (!c.napsUnder.includes(f.def.id) || this.coworker) return;
    if (coworkerWakes(this.coworkerChance, this.coworkersMet, c.maxPerShift, Math.random())) this.wakeSleepyCoworker(f);
  }

  /**
   * The coworker crawls out from under `desk` (default: the desk nearest Dalton), whatever the
   * odds or how often he's turned up. Returns false if he's already around or there's no room.
   * Public for tests and debugging: `game.scene.getScene('Game').wakeSleepyCoworker()`.
   */
  wakeSleepyCoworker(desk?: Fixture): boolean {
    if (this.coworker || this.over) return false;
    const p = this.player;
    const naps = BALANCE.sleepyCoworker.napsUnder;
    const near = (f: Fixture) => Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y);
    const target = desk ?? this.world.fixtures.filter((f) => naps.includes(f.def.id)).sort((a, b) => near(a) - near(b))[0];
    if (!target) return false;
    const nav = this.world.nav;
    const d = nav.toTile(target.x, target.y);
    const me = nav.toTile(p.x, p.y);
    const tile = besideDesk(nav, { x: d.tx, y: d.ty }, { x: me.tx, y: me.ty });
    if (!tile) return false;
    this.coworkersMet++;
    this.coworker = new SleepyCoworker(this, this.world, { x: target.x, y: target.y }, nav.center(tile.x, tile.y));
    return true;
  }

  private updateCoworker(dt: number) {
    const c = this.coworker;
    if (!c) return;
    const event = c.update(dt, this.player);
    if (event) this.onCoworker(c, event);
  }

  private onCoworker(c: SleepyCoworker, event: CoworkerEvent) {
    const b = BALANCE.sleepyCoworker;
    const say = (text: string, seconds: number) =>
      this.dialog({ speaker: NPCS.sleepy_coworker.name, text, seconds, portrait: `${NPCS.sleepy_coworker.sprite}_big` });
    switch (event) {
      case 'jolt':
        sfx.jolt();
        break;
      case 'excuse':
        say(COWORKER_LINES.wake, b.lineSeconds[0]);
        break;
      case 'bribe':
        say(coworkerLine(COWORKER_LINES.bribe, b.hushMoney), b.lineSeconds[1]);
        this.earned = roundMoney(this.earned + b.hushMoney);
        this.hushMoney = roundMoney(this.hushMoney + b.hushMoney);
        sfx.coin();
        this.floatText(c.x, c.y - 70, coworkerLine('+{money}', b.hushMoney), '#7ddc7d', 1600);
        break;
      case 'gone':
        c.destroy();
        this.coworker = null;
        break;
    }
  }

  /**
   * Zoom in on small physical screens (phones, portrait) so a tile stays about 34 CSS pixels wide.
   * The camera may scroll a little past the map's top and bottom so the HUD bands never hide the
   * van or an edge room, and a map smaller than the screen sits in the middle.
   */
  private fitCamera() {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(34 / (TILE * cssPerGamePixel(this.scale)), 1, 3));
    if (!this.world) return;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const portrait = isPortrait(this.scale);
    const padTop = vh * (portrait ? 0.2 : 0.15);
    const padBottom = vh * (portrait ? 0.24 : isTouchDevice() ? 0.18 : 0.06);
    let top = -padTop;
    let height = this.world.height + padTop + padBottom;
    if (height < vh) {
      top -= (vh - height) / 2;
      height = vh;
    }
    let left = 0;
    let width = this.world.width;
    if (width < vw) {
      left = (width - vw) / 2;
      width = vw;
    }
    cam.setBounds(left, top, width, height);
  }

  /** Keys released while paused would otherwise stay "held". */
  private onResume() {
    this.input.keyboard?.resetKeys();
  }

  pauseGame(): void {
    if (this.over || !this.scene.isActive()) return;
    this.player.body.setVelocity(0, 0);
    this.scene.pause();
    this.events.emit('paused');
  }

  // ---- interactions ------------------------------------------------------

  private pickTarget() {
    const p = this.player;
    const reach = BALANCE.interactRangeTiles * TILE;
    let best: Target | null = null;
    let bestDist = reach;
    for (const f of this.world.fixtures) {
      if (!f.ready) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y);
      if (d < bestDist) [best, bestDist] = [{ kind: 'fixture', fixture: f }, d];
    }
    for (const door of this.world.doors) {
      if (!door.locked) continue;
      const r = door.rect;
      const d = Phaser.Math.Distance.Between(p.x, p.y, Phaser.Math.Clamp(p.x, r.left, r.right), Phaser.Math.Clamp(p.y, r.top, r.bottom));
      if (d < bestDist * 0.9) [best, bestDist] = [{ kind: 'door', door }, d];
    }
    if (this.target?.kind === 'fixture' && (best?.kind !== 'fixture' || best.fixture !== this.target.fixture)) {
      this.target.fixture.setTargeted(false);
    }
    this.target = best;
    if (best?.kind === 'fixture') best.fixture.setTargeted(true);
  }

  private doAction() {
    const p = this.player;
    if (p.channel) {
      p.channel = null;
      return;
    }
    const t = this.target;
    if (!t) return;
    if (t.kind === 'door') {
      p.facing = Math.atan2(t.door.y - p.y, t.door.x - p.x);
      p.startChannel({
        kind: 'unlock',
        duration: t.door.unlockSeconds,
        elapsed: 0,
        onComplete: () => {
          t.door.unlock();
          sfx.unlock();
          this.floatText(t.door.x, t.door.y - 30, 'Unlocked!', '#7ddc7d');
          this.target = null;
        },
      });
      return;
    }
    const f = t.fixture;
    if (p.bag.isFull) {
      sfx.denied();
      this.floatText(p.x, p.y - 50, 'Bag full — get to the van!', '#ffc23d');
      return;
    }
    const repair = effectiveRepair(p.character.stats.repair, p.character.specialty, f.def.type);
    p.facing = Math.atan2(f.y - p.y, f.x - p.x);
    p.startChannel({
      kind: 'scrap',
      duration: scrapSeconds(f.def, repair),
      elapsed: 0,
      onComplete: () => {
        if (!f.ready) return;
        const amount = rollYield(f.def);
        const added = p.bag.add(f.def.material, amount);
        f.strip(rollRecharge(f.def));
        this.target = null;
        sfx.scrapDone();
        const color = Phaser.Display.Color.IntegerToColor(MATERIALS[f.def.material].color).rgba;
        const left = amount - added > 0.001 ? ` (bag full, left ${(amount - added).toFixed(2)})` : '';
        this.floatText(f.x, f.y - 30, `+${added.toFixed(2)} ${f.materialName.toLowerCase()}${left}`, color);
        this.maybeWakeCoworker(f);
      },
    });
  }

  private checkVan() {
    const p = this.player;
    if (p.bag.isEmpty || !this.world.van.reach.contains(p.x, p.y)) return;
    const contents = p.bag.takeAll();
    const value = saleValue(contents);
    mergeContents(this.sold, contents);
    this.earned = roundMoney(this.earned + value);
    p.channel = null;
    sfx.sell();
    const van = this.world.van.rect;
    this.floatText(van.centerX, van.top - 20, `SOLD +${money(value)}`, '#7ddc7d', 1600);
    this.tweens.add({ targets: this.world.van.image, scaleX: '*=1.04', scaleY: '*=1.04', yoyo: true, duration: 120 });
  }

  // ---- presentation ------------------------------------------------------

  private syncViews() {
    if (!this.player) return;
    const time = this.time.now;
    const view = this.cameras.main.worldView;
    this.player.syncView(time);
    this.boss.syncView(time, view);
    for (const s of this.students) s.syncView(time, view);
    this.coworker?.syncView(time);

    const g = this.channelBar;
    g.clear();
    const ch = this.player.channel;
    if (ch) {
      const w = 84;
      const x = this.player.x - w / 2;
      const y = this.player.y - 58;
      g.fillStyle(0x12151c, 0.85).fillRoundedRect(x - 4, y - 4, w + 8, 20, 8);
      g.fillStyle(ch.kind === 'scrap' ? 0xe8914a : 0x7ddc7d, 1).fillRoundedRect(x, y, w * Math.min(1, ch.elapsed / ch.duration), 12, 5);
    }
  }

  toast(text: string, color = '#f6f1e5', duration = 2600): void {
    this.events.emit('toast', text, color, duration);
  }

  /** Shows a line in the HUD dialog box. Doesn't pause the game. */
  dialog(line: DialogLine): void {
    this.events.emit('dialog', line);
  }

  floatText(x: number, y: number, text: string, color: string, duration = 1200): void {
    const t = this.add.text(x, y, text, textStyle(30, color)).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 70, alpha: { from: 1, to: 0 }, ease: 'Cubic.Out', duration, onComplete: () => t.destroy() });
  }

  private buildHudState(): HudState {
    const p = this.player;
    return {
      money: 0,
      bagTotal: 0,
      bagCapacity: p.bag.capacity,
      bagContents: {},
      warnings: 0,
      maxWarnings: BALANCE.warningsUntilFired,
      clock: clockText(0),
      progress: 0,
      location: '',
      action: null,
      prompt: null,
      promptBad: false,
      ability: null,
      danger: 0,
      characterName: p.character.name,
      alert: null,
    };
  }

  private refreshHud() {
    const p = this.player;
    const h = this.hud;
    h.money = this.earned;
    h.bagTotal = p.bag.total;
    h.bagCapacity = p.bag.capacity;
    h.bagContents = { ...p.bag.peek() };
    h.warnings = this.warnings;
    h.progress = Math.min(1, this.elapsed / BALANCE.shift.lengthSeconds);
    h.clock = clockText(h.progress);
    h.location = this.world.roomAt(p.x, p.y);
    const bossDanger = this.boss.state === 'chase' ? Math.max(0.6, this.boss.suspicion) : this.boss.suspicion;
    // Yelling and following students count too (and a '?' on high alert).
    const studentDanger = Math.max(0, ...this.students.map((s) => s.danger));
    h.danger = Math.max(bossDanger, studentDanger);
    h.alert = this.alert.hud();
    h.ability = p.ability
      ? {
          name: p.ability.name,
          key: p.ability.id,
          activeLeft: p.abilityLeft,
          duration: p.ability.duration,
          cooldownLeft: p.abilityCooldown,
          cooldown: p.ability.cooldown,
        }
      : null;

    h.promptBad = false;
    if (p.channel) {
      h.action = 'STOP';
      h.prompt = p.channel.kind === 'scrap' ? 'Scrapping… (move to stop)' : 'Unlocking… (move to stop)';
    } else if (this.target?.kind === 'door') {
      h.action = 'UNLOCK';
      h.prompt = `Unlock door (${this.target.door.unlockSeconds}s)`;
    } else if (this.target?.kind === 'fixture') {
      const f = this.target.fixture;
      const range = f.def.range ? `${f.def.range[0]}–${f.def.range[1]}` : `${f.def.scrap}`;
      h.action = 'SCRAP';
      h.prompt = `Scrap ${f.label} · ${range} ${f.materialName.toLowerCase()}`;
      if (p.bag.isFull) {
        h.prompt = 'Bag full — get to the van!';
        h.promptBad = true;
      }
    } else {
      h.action = null;
      h.prompt = p.bag.isFull ? 'Bag full — get to the van!' : null;
      h.promptBad = p.bag.isFull;
    }
  }

  /** Scrap sold this shift, by material, for the summary screen. */
  static soldLines(contents: ScrapContents): string[] {
    return MATERIAL_ORDER.filter((m) => (contents[m] ?? 0) > 0).map(
      (m) => `${MATERIALS[m].name}: ${contents[m]!.toFixed(2)} × ${money(MATERIALS[m].pricePerUnit)}`,
    );
  }
}
