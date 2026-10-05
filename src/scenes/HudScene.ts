import Phaser from 'phaser';
import { MATERIALS, MATERIAL_ORDER } from '../config/materials';
import { controls } from '../input/Controls';
import { isMuted, setMuted, sfx, unlockAudio } from '../systems/sfx';
import { updateSave } from '../systems/save';
import { Button, COLORS, cssPerGamePixel, isPortrait, isTouchDevice, money, textStyle } from '../ui/theme';
import type { GameScene, HudState } from './GameScene';

const ABILITY_SHORT: Record<string, string> = { student_disguise: 'HIDE', look_busy: 'LOOK\nBUSY' };

/** Screen-space UI on top of the game: stats, prompts, toasts, touch controls and the pause menu. */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private touch = false;
  private paused = false;
  private pausedFrame = -1;
  private ui = 1;
  private clockTop = 0;
  private toastTop = 0;
  private promptY = 0;

  private panel!: Phaser.GameObjects.Graphics;
  private moneyText!: Phaser.GameObjects.Text;
  private bagText!: Phaser.GameObjects.Text;
  private bagLabel!: Phaser.GameObjects.Text;
  private locationText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private warnLabel!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;
  private dynamic!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private toasts: Phaser.GameObjects.Text[] = [];

  private pauseZone!: Phaser.GameObjects.Zone;
  private actionZone!: Phaser.GameObjects.Zone;
  private abilityZone!: Phaser.GameObjects.Zone;
  private actionText!: Phaser.GameObjects.Text;
  private abilityBtnText!: Phaser.GameObjects.Text;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private pauseMenu: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.gameScene = this.scene.get('Game') as GameScene;
    this.touch = isTouchDevice();
    this.paused = false;
    this.pauseMenu = null;
    this.toasts = [];
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.input.addPointer(3);

    this.vignette = this.add.graphics();
    this.panel = this.add.graphics();
    this.dynamic = this.add.graphics();
    this.moneyText = this.add.text(0, 0, '', textStyle(52, COLORS.copper));
    this.bagLabel = this.add.text(0, 0, 'BAG', textStyle(22, COLORS.muted));
    this.bagText = this.add.text(0, 0, '', textStyle(22)).setOrigin(0.5);
    this.locationText = this.add.text(0, 0, '', textStyle(24, COLORS.muted));
    this.clockText = this.add.text(0, 0, '', textStyle(46)).setOrigin(0.5, 0);
    this.warnLabel = this.add.text(0, 0, 'WARNINGS', textStyle(20, COLORS.muted)).setOrigin(1, 0);
    this.promptText = this.add.text(0, 0, '', textStyle(30)).setOrigin(0.5);
    this.abilityText = this.add.text(0, 0, '', textStyle(24)).setOrigin(0, 0.5);
    this.actionText = this.add.text(0, 0, '', textStyle(34, COLORS.text, { align: 'center' })).setOrigin(0.5);
    this.abilityBtnText = this.add.text(0, 0, '', textStyle(24, COLORS.text, { align: 'center' })).setOrigin(0.5);

    this.pauseZone = this.add.zone(0, 0, 96, 96).setInteractive({ useHandCursor: true });
    this.pauseZone.on('pointerup', () => controls.press('pause'));
    this.actionZone = this.add.zone(0, 0, 10, 10).setInteractive();
    this.actionZone.on('pointerdown', () => controls.press('action'));
    this.abilityZone = this.add.zone(0, 0, 10, 10).setInteractive();
    this.abilityZone.on('pointerdown', () => controls.press('ability'));

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      unlockAudio();
      // Ignore the same key press that opened the menu.
      if (this.paused && this.game.loop.frame !== this.pausedFrame && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        this.resume();
      }
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.gameScene.events.on('toast', this.showToast, this);
    this.gameScene.events.on('paused', this.showPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.gameScene.events.off('toast', this.showToast, this);
      this.gameScene.events.off('paused', this.showPause, this);
      controls.reset();
    });

    this.layout();
  }

  private get W() {
    return this.scale.width;
  }

  private get H() {
    return this.scale.height;
  }

  // ---- layout ------------------------------------------------------------

  private layout(): void {
    // Scale the HUD so text stays readable on small screens (money ~24 CSS px), and in
    // portrait keep the top row inside the screen width.
    const portrait = isPortrait(this.scale);
    let ui = Math.max(this.touch ? 1.12 : 1, 24 / (52 * cssPerGamePixel(this.scale)));
    if (portrait) ui = Math.min(ui, this.W / 880);
    this.ui = ui;
    const s = ui;
    const m = 24 * s;
    const ar = 112 * s;
    // Portrait: the clock moves under the top row. Prompts sit above the touch buttons.
    this.clockTop = portrait ? m + 180 * s : m - 6 * s;
    this.toastTop = this.clockTop + 156 * s;
    this.promptY = !this.touch ? this.H - m - 60 * s : portrait ? this.H - m - 2 * ar - 120 * s : this.H - m - 52 * s;
    this.moneyText.setPosition(m + 22 * s, m + 10 * s).setFontSize(52 * s);
    this.bagLabel.setPosition(m + 22 * s, m + 84 * s).setFontSize(22 * s);
    this.locationText.setPosition(m + 22 * s, m + 120 * s).setFontSize(24 * s);
    this.clockText.setPosition(this.W / 2, this.clockTop + 10 * s).setFontSize(46 * s);
    this.warnLabel.setPosition(this.W - m - 120 * s, m + 6 * s).setFontSize(20 * s);
    this.pauseZone.setPosition(this.W - m - 44 * s, m + 44 * s).setSize(96 * s, 96 * s);
    this.promptText.setFontSize(30 * s);
    this.abilityText.setFontSize(24 * s);

    this.actionZone.setPosition(this.W - m - ar - 30 * s, this.H - m - ar - 30 * s).setSize(ar * 2.2, ar * 2.2);
    this.actionText.setPosition(this.actionZone.x, this.actionZone.y).setFontSize(34 * s);
    const br = 76 * s;
    this.abilityZone.setPosition(this.actionZone.x - ar - br - 60 * s, this.H - m - br - 10 * s).setSize(br * 2.2, br * 2.2);
    this.abilityBtnText.setPosition(this.abilityZone.x, this.abilityZone.y).setFontSize(24 * s);

    const touchOnly = [this.actionZone, this.actionText];
    for (const o of touchOnly) o.setVisible(this.touch);
    this.actionZone.input!.enabled = this.touch;
    const hasAbility = !!this.gameScene.player?.ability;
    this.abilityZone.setVisible(this.touch && hasAbility);
    this.abilityZone.input!.enabled = this.touch && hasAbility;
    this.abilityBtnText.setVisible(this.touch && hasAbility);
    this.abilityText.setVisible(!this.touch && hasAbility);

    this.toasts.forEach((t, i) => t.setPosition(this.W / 2, this.toastY(i)));
    if (this.pauseMenu) {
      this.pauseMenu.destroy();
      this.pauseMenu = null;
      this.buildPauseMenu();
    }
  }

  private toastY(i: number) {
    return this.toastTop + i * 62 * this.ui;
  }

  // ---- per-frame ---------------------------------------------------------

  update(time: number): void {
    const h = this.gameScene.hud;
    if (!h) return;
    const s = this.ui;
    const m = 24 * s;
    const W = this.W;
    const H = this.H;

    this.moneyText.setText(money(h.money));
    this.locationText.setText(h.location);
    this.clockText.setText(h.clock);

    // Panels
    const p = this.panel;
    p.clear();
    p.fillStyle(COLORS.panel, 0.72);
    p.fillRoundedRect(m, m, 440 * s, 160 * s, 18 * s);
    p.fillRoundedRect(W / 2 - 170 * s, this.clockTop, 340 * s, 96 * s, 18 * s);
    p.fillRoundedRect(W - m - 360 * s, m, 360 * s, 96 * s, 18 * s);

    const g = this.dynamic;
    g.clear();

    // Bag bar, split by material colour.
    const bx = m + 90 * s;
    const by = m + 84 * s;
    const bw = 330 * s;
    const bh = 28 * s;
    g.fillStyle(0x000000, 0.5).fillRoundedRect(bx, by, bw, bh, 8 * s);
    let x = bx;
    for (const mat of MATERIAL_ORDER) {
      const amt = h.bagContents[mat] ?? 0;
      if (amt <= 0) continue;
      const w = (amt / h.bagCapacity) * bw;
      g.fillStyle(MATERIALS[mat].color, 1).fillRect(x, by, w, bh);
      x += w;
    }
    const full = h.bagTotal >= h.bagCapacity - 0.001;
    g.lineStyle(3 * s, full ? 0xff5a4f : 0x14161c, 1).strokeRoundedRect(bx, by, bw, bh, 8 * s);
    this.bagText.setPosition(bx + bw / 2, by + bh / 2).setText(`${h.bagTotal.toFixed(2)} / ${h.bagCapacity.toFixed(2)}`);
    this.bagText.setColor(full ? COLORS.bad : COLORS.text);

    // Shift progress with the coffee marker.
    const px = W / 2 - 130 * s;
    const py = this.clockTop + 70 * s;
    const pw = 260 * s;
    g.fillStyle(0x000000, 0.5).fillRoundedRect(px, py, pw, 10 * s, 5 * s);
    g.fillStyle(0xe8914a, 1).fillRoundedRect(px, py, Math.max(10 * s, pw * h.progress), 10 * s, 5 * s);
    g.fillStyle(0xffffff, 0.8).fillRect(px + pw * 0.5 - 2, py - 4 * s, 4, 18 * s);

    // Warnings: three hard-hat dots.
    for (let i = 0; i < h.maxWarnings; i++) {
      const cx = W - m - 330 * s + i * 66 * s + 30 * s;
      const cy = m + 58 * s;
      const used = i < h.warnings;
      g.fillStyle(used ? 0xff5a4f : 0x000000, used ? 1 : 0.4).fillCircle(cx, cy, 22 * s);
      g.lineStyle(4 * s, used ? 0xffffff : 0x6b7280, 1).strokeCircle(cx, cy, 22 * s);
      if (used) g.fillStyle(0xffffff, 1).fillRect(cx - 3 * s, cy - 12 * s, 6 * s, 14 * s).fillCircle(cx, cy + 9 * s, 3.5 * s);
    }
    this.warnLabel.setPosition(W - m - 330 * s, m + 2 * s).setOrigin(0, 0);

    // Pause button.
    const pz = this.pauseZone;
    g.fillStyle(COLORS.panel, 0.85).fillCircle(pz.x, pz.y, 36 * s);
    g.fillStyle(0xffffff, 1).fillRect(pz.x - 12 * s, pz.y - 14 * s, 8 * s, 28 * s).fillRect(pz.x + 4 * s, pz.y - 14 * s, 8 * s, 28 * s);

    // Prompt
    const promptY = this.promptY;
    const promptX = this.touch && !isPortrait(this.scale) ? W / 2 - 80 * s : W / 2;
    if (h.prompt) {
      const verb = !this.touch && !h.promptBad && (h.action === 'UNLOCK' || h.action === 'SCRAP') ? '[E]  ' : '';
      this.promptText.setText(verb + h.prompt).setColor(h.promptBad ? COLORS.warn : COLORS.text).setVisible(true);
      this.promptText.setPosition(promptX, promptY);
      const tw = this.promptText.width + 48 * s;
      g.fillStyle(COLORS.panel, 0.8).fillRoundedRect(promptX - tw / 2, promptY - 30 * s, tw, 60 * s, 16 * s);
    } else {
      this.promptText.setVisible(false);
    }

    // Ability (keyboard hint) / buttons (touch)
    if (h.ability) {
      const ready = h.ability.cooldownLeft <= 0;
      const active = h.ability.activeLeft > 0;
      if (!this.touch) {
        const ax = m;
        const ay = H - m - 40 * s;
        const label = active ? `${h.ability.name}  ${h.ability.activeLeft.toFixed(1)}s` : ready ? `[Q]  ${h.ability.name}` : `${h.ability.name}  ${Math.ceil(h.ability.cooldownLeft)}s`;
        this.abilityText.setText(label).setPosition(ax + 20 * s, ay).setColor(active ? '#c9a7ff' : ready ? COLORS.text : COLORS.muted);
        const tw = this.abilityText.width + 40 * s;
        g.fillStyle(COLORS.panel, 0.8).fillRoundedRect(ax, ay - 30 * s, tw, 60 * s, 16 * s);
        if (!ready && !active) {
          g.fillStyle(0x7e57c2, 0.8).fillRect(ax + 12 * s, ay + 20 * s, (tw - 24 * s) * (1 - h.ability.cooldownLeft / h.ability.cooldown), 5 * s);
        }
      } else {
        const z = this.abilityZone;
        const r = 76 * s;
        g.fillStyle(active ? 0x7e57c2 : 0x2a2f3d, ready || active ? 0.9 : 0.55).fillCircle(z.x, z.y, r);
        g.lineStyle(5 * s, 0xc9a7ff, ready ? 1 : 0.35).strokeCircle(z.x, z.y, r);
        if (!ready && !active) {
          g.lineStyle(10 * s, 0xc9a7ff, 0.9).beginPath();
          g.arc(z.x, z.y, r - 10 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - h.ability.cooldownLeft / h.ability.cooldown));
          g.strokePath();
        }
        this.abilityBtnText.setText(ABILITY_SHORT[h.ability.key] ?? 'ABILITY').setAlpha(ready || active ? 1 : 0.5);
      }
    }

    if (this.touch) this.drawTouch(g, h, time);

    // Red edges while Mr. Gravy is on to you.
    const v = this.vignette;
    v.clear();
    if (h.danger > 0.02) {
      const pulse = 0.75 + 0.25 * Math.sin(time / 110);
      for (let i = 0; i < 6; i++) {
        v.lineStyle(26, 0xff2a1a, h.danger * 0.42 * pulse * (1 - i / 6));
        v.strokeRect(13 + i * 24, 13 + i * 24, W - 26 - i * 48, H - 26 - i * 48);
      }
    }
  }

  private drawTouch(g: Phaser.GameObjects.Graphics, h: HudState, time: number) {
    const s = this.ui;
    // Action button
    const z = this.actionZone;
    const r = 112 * s;
    const enabled = !!h.action;
    g.fillStyle(enabled ? 0xd9772f : 0x2a2f3d, enabled ? 0.92 : 0.5).fillCircle(z.x, z.y, r);
    g.lineStyle(6 * s, 0x14161c, 1).strokeCircle(z.x, z.y, r);
    if (enabled && h.action !== 'STOP') g.lineStyle(4 * s, 0xffffff, 0.35 + 0.25 * Math.sin(time / 160)).strokeCircle(z.x, z.y, r + 10 * s);
    this.actionText.setText(h.action ?? 'ACTION').setAlpha(enabled ? 1 : 0.45);

    // Joystick: floating where your thumb lands, with a faint hint when idle.
    const st = this.stick;
    const base = 120 * s;
    if (st.id >= 0) {
      g.fillStyle(0xffffff, 0.12).fillCircle(st.ox, st.oy, base);
      g.lineStyle(4 * s, 0xffffff, 0.35).strokeCircle(st.ox, st.oy, base);
      g.fillStyle(0xffffff, 0.5).fillCircle(st.x, st.y, 56 * s);
    } else {
      const hx = 24 * s + base + 40 * s;
      const hy = this.H - 24 * s - base - 40 * s;
      g.fillStyle(0xffffff, 0.06).fillCircle(hx, hy, base);
      g.lineStyle(3 * s, 0xffffff, 0.18).strokeCircle(hx, hy, base);
      g.fillStyle(0xffffff, 0.18).fillCircle(hx, hy, 56 * s);
    }
  }

  // ---- touch joystick ----------------------------------------------------

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    unlockAudio();
    if (p.wasTouch && !this.touch) {
      this.touch = true;
      this.layout();
    }
    if (!this.touch || this.paused || over.length > 0) return;
    if (p.x > this.W * 0.55 || p.y < Math.max(200 * this.ui, this.clockTop + 110 * this.ui)) return;
    this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
    controls.touchMove = { x: 0, y: 0 };
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.stick.id) return;
    const max = 120 * this.ui;
    let dx = p.x - this.stick.ox;
    let dy = p.y - this.stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      // Drag the base along so the stick never feels "stuck" at the edge.
      this.stick.ox += (dx / len) * (len - max);
      this.stick.oy += (dy / len) * (len - max);
      dx = p.x - this.stick.ox;
      dy = p.y - this.stick.oy;
    }
    this.stick.x = p.x;
    this.stick.y = p.y;
    controls.touchMove = { x: dx / max, y: dy / max };
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (p.id !== this.stick.id) return;
    this.stick.id = -1;
    controls.touchMove = { x: 0, y: 0 };
  }

  // ---- toasts ------------------------------------------------------------

  private showToast(text: string, color: string, duration: number) {
    const t = this.add
      .text(this.W / 2, this.toastY(this.toasts.length), text, textStyle(36 * this.ui, color, { align: 'center', wordWrap: { width: this.W * 0.8 } }))
      .setOrigin(0.5, 0)
      .setAlpha(0);
    this.toasts.push(t);
    this.tweens.add({ targets: t, alpha: 1, y: '-=10', duration: 200 });
    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.toasts = this.toasts.filter((x) => x !== t);
          t.destroy();
          this.toasts.forEach((o, i) => this.tweens.add({ targets: o, y: this.toastY(i), duration: 150 }));
        },
      });
    });
  }

  // ---- pause -------------------------------------------------------------

  private showPause() {
    this.paused = true;
    this.pausedFrame = this.game.loop.frame;
    this.stick.id = -1;
    controls.reset();
    this.buildPauseMenu();
  }

  private buildPauseMenu() {
    const W = this.W;
    const H = this.H;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0b0d12, 0.72).setInteractive();
    // Menu content is laid out around (0, 0) and scaled up on small screens.
    const k = Math.max(1, this.ui * 0.9);
    const title = this.add.text(0, -300, 'PAUSED', textStyle(84, COLORS.copper)).setOrigin(0.5);
    const help = this.touch
      ? 'Left thumb: move  ·  SCRAP button: scrap / unlock  ·  HIDE: ability'
      : 'WASD / arrows: move  ·  E or Space: scrap / unlock  ·  Q: ability  ·  Esc: pause';
    const helpText = this.add
      .text(0, -210, help, textStyle(26, COLORS.muted, { align: 'center', wordWrap: { width: (W * 0.9) / k } }))
      .setOrigin(0.5);
    const resume = new Button(this, 0, -90, 'RESUME', () => this.resume(), { width: 440 });
    const restart = new Button(this, 0, 30, 'RESTART SHIFT', () => this.restartShift(), { width: 440, fill: 0x3d4558 });
    const sound = new Button(this, 0, 150, isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => {
      setMuted(!isMuted());
      updateSave((d) => (d.muted = isMuted()));
      sound.label.setText(isMuted() ? 'SOUND: OFF' : 'SOUND: ON');
      sfx.click();
    }, { width: 440, fill: 0x3d4558 });
    const quit = new Button(this, 0, 270, 'QUIT TO MENU', () => this.quit(), { width: 440, fill: 0x3d4558 });
    const content = this.add.container(W / 2, H / 2, [title, helpText, resume, restart, sound, quit]).setScale(k);
    this.pauseMenu = this.add.container(0, 0, [dim, content]).setDepth(100);
  }

  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    controls.reset();
    this.scene.resume('Game');
  }

  private restartShift() {
    const character = this.gameScene.player.character.id;
    this.scene.start('Game', { character });
  }

  private quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
