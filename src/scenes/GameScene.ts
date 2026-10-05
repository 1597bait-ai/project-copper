import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import { CHARACTERS, type CharacterDef } from '../config/characters';
import { MATERIALS, MATERIAL_ORDER } from '../config/materials';
import { NPCS } from '../config/npcs';
import { Boss } from '../entities/Boss';
import type { Door } from '../entities/Door';
import type { Fixture } from '../entities/Fixture';
import { Player } from '../entities/Player';
import { controls } from '../input/Controls';
import { mergeContents, roundMoney, saleValue, type ScrapContents } from '../systems/Bag';
import { clockText } from '../systems/clock';
import { effectiveRepair, rollRecharge, rollYield, scrapSeconds } from '../systems/scrapping';
import { sfx } from '../systems/sfx';
import { cssPerGamePixel, money, textStyle } from '../ui/theme';
import { World } from '../world/World';

export interface GameInit {
  character?: string;
  map?: string;
}

export interface ShiftSummary {
  fired: boolean;
  earned: number;
  sold: ScrapContents;
  lost: ScrapContents;
  warnings: number;
  character: string;
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
}

export class GameScene extends Phaser.Scene {
  world!: World;
  player!: Player;
  boss!: Boss;
  hud!: HudState;

  private characterId = 'dalton';
  private mapKey = 'school-01';
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
    this.mapKey = data.map ?? 'school-01';
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
    controls.reset();
  }

  create(): void {
    const character: CharacterDef = CHARACTERS[this.characterId];
    this.world = new World(this, this.mapKey);
    this.physics.world.setBounds(0, 0, this.world.width, this.world.height);

    this.player = new Player(this, this.world.playerSpawn.x, this.world.playerSpawn.y, character);
    this.boss = new Boss(this, this.world, NPCS.mr_gravy);

    for (const body of [this.player.zone, this.boss.zone]) {
      this.physics.add.collider(body, this.world.walls);
      this.physics.add.collider(body, this.world.solids);
    }

    this.channelBar = this.add.graphics().setDepth(25);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.width, this.world.height);
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
    const dt = Math.min(deltaMs / 1000, 0.05);

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
    sfx.warning();
    this.cameras.main.shake(250, 0.008);
    this.cameras.main.flash(200, 255, 60, 40);
    const lines = ['HEY! That\'s school property!', 'What do you think you\'re doing?!', 'My office. NOW. ...Actually, get back to work.'];
    this.floatText(this.boss.x, this.boss.y - 60, lines[Math.min(this.warnings, lines.length) - 1], '#ff8a7a', 2200);
    if (this.warnings >= BALANCE.warningsUntilFired) {
      this.toast("THREE WARNINGS — YOU'RE FIRED!", '#ff5a4f', 2500);
      this.over = true;
      this.player.body.setVelocity(0, 0);
      this.boss.body.setVelocity(0, 0);
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
    this.player.body.setVelocity(0, 0);
    this.boss.body.setVelocity(0, 0);
    if (!fired && !this.player.bag.isEmpty) mergeContents(this.lost, this.player.bag.takeAll());
    fired ? sfx.fired() : sfx.shiftOver();
    const summary: ShiftSummary = {
      fired,
      earned: roundMoney(this.earned),
      sold: this.sold,
      lost: this.lost,
      warnings: this.warnings,
      character: this.characterId,
    };
    this.cameras.main.fadeOut(500, 20, 22, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Hud');
      this.scene.start('ShiftEnd', summary);
    });
  }

  /** Zoom in on small physical screens (phones, portrait) so a tile stays about 34 CSS pixels wide. */
  private fitCamera() {
    this.cameras.main.setZoom(Phaser.Math.Clamp(34 / (TILE * cssPerGamePixel(this.scale)), 1, 3));
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
    this.player.syncView(time);
    this.boss.syncView(time);

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
    h.danger = this.boss.state === 'chase' ? Math.max(0.6, this.boss.suspicion) : this.boss.suspicion;
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
