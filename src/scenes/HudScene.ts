import Phaser from 'phaser';
import { UI_ICONS } from '../art/ui';
import { MATERIALS, MATERIAL_ORDER } from '../config/materials';
import { controls, oncePerKeyEvent } from '../input/Controls';
import { isMuted, setMuted, sfx, unlockAudio } from '../systems/sfx';
import { updateSave } from '../systems/save';
import { DialogQueue, type DialogView } from '../ui/dialogQueue';
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  Button,
  COLORS,
  boxBorder,
  cssPerGamePixel,
  drawBox,
  drawMoreArrow,
  fitWidth,
  isPortrait,
  isTouchDevice,
  money,
  pixelRect,
  setTextColor,
  setTextSize,
  textStyle,
} from '../ui/theme';
import type { DialogLine, GameScene, HudState } from './GameScene';

const ABILITY_SHORT: Record<string, string> = { student_disguise: 'HIDE', look_busy: 'LOOK\nBUSY' };

/** The red HIGH ALERT banner. */
const ALERT_STYLE = { fill: COLORS.alert, edge: 0x5a1010, rim: 0xff9a80 };
/** Toasts: dark windows, so the game's coloured messages stay readable. */
const TOAST_STYLE = { fill: COLORS.panel, edge: 0x10162a, rim: 0x6276b0, alpha: 0.94 };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Toast {
  box: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** A filled circle drawn in square "pixels" of size u, like the GBA's chunky round buttons. */
function pixelCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, { u, color, alpha = 1 }: { u: number; color: number; alpha?: number }) {
  g.fillStyle(color, alpha);
  const rows = Math.ceil(r / u);
  for (let i = -rows; i < rows; i++) {
    const yMid = (i + 0.5) * u;
    const half = Math.sqrt(Math.max(0, r * r - yMid * yMid));
    const hw = Math.round(half / u) * u;
    if (hw > 0) g.fillRect(cx - hw, cy + i * u, hw * 2, u);
  }
}

/** Screen-space UI on top of the game: stats, prompts, toasts, dialog, touch controls and the pause menu. */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private touch = false;
  private paused = false;
  private pausedFrame = -1;
  /** HUD scale (read by the e2e test). */
  private ui = 1;
  private clockTop = 0;
  private promptY = 0;
  private promptX = 0;
  /** Right edge of the ability box (desktop), so the prompt can keep clear of it. */
  private abilityRight = 0;
  private statusBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private clockBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private warnBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private pauseBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private alertBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dialogBox: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private panel!: Phaser.GameObjects.Graphics;
  private moneyText!: Phaser.GameObjects.Text;
  private bagText!: Phaser.GameObjects.Text;
  private locationText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private warnLabel!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;
  private alertText!: Phaser.GameObjects.Text;
  private icons!: { coin: Phaser.GameObjects.Image; bag: Phaser.GameObjects.Image; pin: Phaser.GameObjects.Image; clock: Phaser.GameObjects.Image; star: Phaser.GameObjects.Image };
  private alertIcons: Phaser.GameObjects.Image[] = [];
  private strikes: Phaser.GameObjects.Image[] = [];
  private dynamic!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private toasts: Toast[] = [];

  private pauseZone!: Phaser.GameObjects.Zone;
  private actionZone!: Phaser.GameObjects.Zone;
  private abilityZone!: Phaser.GameObjects.Zone;
  private actionText!: Phaser.GameObjects.Text;
  private abilityBtnText!: Phaser.GameObjects.Text;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private pauseMenu: Phaser.GameObjects.Container | null = null;
  private pauseButtons: { button: Button; run: () => void }[] = [];
  private pauseIndex = 0;

  // Dialog box
  private dialog = new DialogQueue();
  /** Dialog time (seconds): stands still while paused, like the game. */
  private dialogClock = 0;
  private dialogLayer!: Phaser.GameObjects.Container;
  private dialogG!: Phaser.GameObjects.Graphics;
  private dialogName!: Phaser.GameObjects.Text;
  private dialogText!: Phaser.GameObjects.Text;
  private dialogPortrait!: Phaser.GameObjects.Image;
  /** The line on screen, already wrapped to the box (so words don't jump lines while typing). */
  private dialogShown: { line: DialogLine; lines: string[]; width: number } | null = null;
  private dialogTap: { id: number; x: number; y: number; t: number } | null = null;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.gameScene = this.scene.get('Game') as GameScene;
    this.touch = isTouchDevice();
    this.paused = false;
    this.pauseMenu = null;
    this.pauseButtons = [];
    this.toasts = [];
    this.stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.dialog = new DialogQueue();
    this.dialogClock = 0;
    this.dialogShown = null;
    this.dialogTap = null;
    this.input.addPointer(3);

    this.vignette = this.add.graphics();
    this.panel = this.add.graphics();
    this.dynamic = this.add.graphics();
    const icon = (key: string) => this.add.image(0, 0, key).setOrigin(0.5);
    this.icons = { coin: icon(UI_ICONS.coin), bag: icon(UI_ICONS.bag), pin: icon(UI_ICONS.pin), clock: icon(UI_ICONS.clock), star: icon(UI_ICONS.star) };
    this.alertIcons = [icon(UI_ICONS.alert), icon(UI_ICONS.alert)];
    this.strikes = [];
    this.moneyText = this.add.text(0, 0, '', textStyle(48, COLORS.boxCopper)).setOrigin(0, 0.5);
    this.bagText = this.add.text(0, 0, '', textStyle(24, COLORS.boxText)).setOrigin(0, 0.5);
    this.locationText = this.add.text(0, 0, '', textStyle(28, COLORS.boxMuted)).setOrigin(0, 0.5);
    this.clockText = this.add.text(0, 0, '', textStyle(46, COLORS.boxText)).setOrigin(0.5, 0.5);
    this.warnLabel = this.add.text(0, 0, 'WARNINGS', textStyle(22, COLORS.boxMuted)).setOrigin(0, 0);
    this.promptText = this.add.text(0, 0, '', textStyle(34, COLORS.boxText)).setOrigin(0.5);
    this.abilityText = this.add.text(0, 0, '', textStyle(28, COLORS.boxText)).setOrigin(0, 0.5);
    this.alertText = this.add.text(0, 0, '', textStyle(32, COLORS.text, { fontStyle: '700' })).setOrigin(0.5);
    this.actionText = this.add.text(0, 0, '', textStyle(38, COLORS.text, { align: 'center' })).setOrigin(0.5);
    this.abilityBtnText = this.add.text(0, 0, '', textStyle(28, COLORS.text, { align: 'center' })).setOrigin(0.5);

    this.dialogG = this.add.graphics();
    this.dialogPortrait = this.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.dialogName = this.add.text(0, 0, '', textStyle(30, COLORS.boxText, { fontStyle: '700' })).setOrigin(0, 0.5);
    this.dialogText = this.add.text(0, 0, '', textStyle(36, COLORS.boxText, { lineSpacing: 6 })).setOrigin(0, 0);
    this.dialogLayer = this.add.container(0, 0, [this.dialogG, this.dialogPortrait, this.dialogName, this.dialogText]).setDepth(50).setVisible(false);

    this.pauseZone = this.add.zone(0, 0, 96, 96).setInteractive({ useHandCursor: true });
    this.pauseZone.on('pointerup', () => controls.press('pause'));
    this.actionZone = this.add.zone(0, 0, 10, 10).setInteractive();
    this.actionZone.on('pointerdown', () => controls.press('action'));
    this.abilityZone = this.add.zone(0, 0, 10, 10).setInteractive();
    this.abilityZone.on('pointerdown', () => controls.press('ability'));

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.keyboard!.on('keydown', oncePerKeyEvent((e: KeyboardEvent) => this.onKey(e)));

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.gameScene.events.on('toast', this.showToast, this);
    this.gameScene.events.on('dialog', this.showDialog, this);
    this.gameScene.events.on('paused', this.showPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.gameScene.events.off('toast', this.showToast, this);
      this.gameScene.events.off('dialog', this.showDialog, this);
      this.gameScene.events.off('paused', this.showPause, this);
      this.dialog.clear();
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

  /** Pixel size of HUD window frames. */
  private get unit() {
    return Math.max(2, Math.round(3 * this.ui));
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
    const W = this.W;
    const H = this.H;

    // Top row: status (left), warnings + pause (right). Portrait: the clock moves under it.
    this.statusBox = { x: m, y: m, w: 440 * s, h: 168 * s };
    this.clockTop = portrait ? m + 184 * s : m;
    this.clockBox = { x: W / 2 - 160 * s, y: this.clockTop, w: 320 * s, h: 104 * s };
    this.pauseBox = { x: W - m - 100 * s, y: m, w: 100 * s, h: 104 * s };
    this.warnBox = { x: W - m - 364 * s, y: m, w: 250 * s, h: 104 * s };
    this.alertBox = { x: W / 2 - 240 * s, y: this.clockTop + this.clockBox.h + 12 * s, w: 480 * s, h: 68 * s };

    const st = this.statusBox;
    const tx = st.x + 84 * s;
    this.icons.coin.setPosition(st.x + 46 * s, st.y + 46 * s).setScale((42 * s) / 48);
    setTextSize(this.moneyText, 48 * s).setPosition(tx, st.y + 44 * s);
    this.icons.bag.setPosition(st.x + 46 * s, st.y + 96 * s).setScale((40 * s) / 48);
    setTextSize(this.bagText, 24 * s).setPosition(tx + 232 * s, st.y + 96 * s);
    this.icons.pin.setPosition(st.x + 46 * s, st.y + 136 * s).setScale((36 * s) / 44);
    // Cleared so the next frame sets (and fits) it at the new size.
    setTextSize(this.locationText.setText(''), 28 * s).setPosition(tx, st.y + 135 * s);

    const cb = this.clockBox;
    this.icons.clock.setPosition(cb.x + 46 * s, cb.y + 42 * s).setScale((40 * s) / 48);
    setTextSize(this.clockText, 46 * s).setPosition(cb.x + cb.w / 2 + 22 * s, cb.y + 40 * s);

    setTextSize(this.warnLabel, 22 * s).setPosition(this.warnBox.x + 24 * s, this.warnBox.y + 16 * s);
    this.pauseZone.setPosition(this.pauseBox.x + this.pauseBox.w / 2, this.pauseBox.y + this.pauseBox.h / 2).setSize(this.pauseBox.w, this.pauseBox.h);

    const ab = this.alertBox;
    setTextSize(this.alertText, 32 * s).setPosition(ab.x + ab.w / 2, ab.y + 28 * s);
    this.alertIcons[0].setPosition(ab.x + 34 * s, ab.y + ab.h / 2).setScale((40 * s) / 48);
    this.alertIcons[1].setPosition(ab.x + ab.w - 34 * s, ab.y + ab.h / 2).setScale((40 * s) / 48);

    setTextSize(this.promptText, 34 * s);
    setTextSize(this.abilityText, 28 * s);
    this.icons.star.setScale((34 * s) / 40);

    // Prompts sit above the touch buttons.
    this.promptY = !this.touch ? H - m - 46 * s : portrait ? H - m - 2 * ar - 120 * s : H - m - 52 * s;
    this.promptX = this.touch && !portrait ? W / 2 - 80 * s : W / 2;

    this.actionZone.setPosition(W - m - ar - 30 * s, H - m - ar - 30 * s).setSize(ar * 2.2, ar * 2.2);
    setTextSize(this.actionText, 38 * s).setPosition(this.actionZone.x, this.actionZone.y);
    const br = 76 * s;
    this.abilityZone.setPosition(this.actionZone.x - ar - br - 60 * s, H - m - br - 10 * s).setSize(br * 2.2, br * 2.2);
    setTextSize(this.abilityBtnText, 28 * s).setPosition(this.abilityZone.x, this.abilityZone.y);

    this.dialogBox = this.dialogRect(portrait);

    for (const o of [this.actionZone, this.actionText]) o.setVisible(this.touch);
    this.actionZone.input!.enabled = this.touch;
    const hasAbility = !!this.gameScene.player?.ability;
    this.abilityZone.setVisible(this.touch && hasAbility);
    this.abilityZone.input!.enabled = this.touch && hasAbility;
    this.abilityBtnText.setVisible(this.touch && hasAbility);
    this.abilityText.setVisible(!this.touch && hasAbility);
    this.icons.star.setVisible(!this.touch && hasAbility);

    for (const t of this.toasts) this.styleToast(t);
    if (this.dialogShown) this.dialogShown = null; // re-wrapped for the new size next frame
    if (this.pauseMenu) {
      this.pauseMenu.destroy();
      this.pauseMenu = null;
      this.buildPauseMenu();
    }
  }

  /**
   * Where the dialog box goes: along the bottom, clear of the touch joystick and buttons. On
   * desktops it sits above the prompt; with touch controls the prompt moves above it instead.
   */
  private dialogRect(portrait: boolean): Rect {
    const s = this.ui;
    const m = 24 * s;
    const ar = 112 * s;
    const W = this.W;
    const H = this.H;
    if (!this.touch) {
      const w = Math.min(W - 2 * m, 1240 * s);
      const h = 196 * s;
      return { x: (W - w) / 2, y: H - m - 104 * s - h, w, h };
    }
    if (portrait) {
      const h = 228 * s;
      return { x: m, y: H - m - 2 * ar - 60 * s - h, w: W - 2 * m, h };
    }
    // Landscape: between the joystick's resting spot and the ability / scrap buttons.
    const left = m + 300 * s;
    const right = W - m - 500 * s;
    const h = 184 * s;
    if (right - left >= 760 * s) return { x: left, y: H - m - h, w: right - left, h };
    const w = Math.min(W - 2 * m, 1240 * s);
    return { x: (W - w) / 2, y: H - m - 2 * ar - 40 * s - h, w, h };
  }

  // ---- per-frame ---------------------------------------------------------

  update(time: number, delta: number): void {
    const h = this.gameScene.hud;
    if (!h) return;
    const s = this.ui;
    const m = 24 * s;
    const u = this.unit;
    const W = this.W;
    const H = this.H;

    this.moneyText.setText(money(h.money));
    if (this.locationText.text !== h.location) {
      // Long room names shrink to fit the window.
      setTextSize(this.locationText.setText(h.location), 28 * s);
      fitWidth(this.locationText, this.statusBox.x + this.statusBox.w - 20 * s - this.locationText.x);
    }
    this.clockText.setText(h.clock);

    const p = this.panel.clear();
    const g = this.dynamic.clear();

    // Status window: money, bag, location.
    const st = this.statusBox;
    drawBox(p, st.x, st.y, st.w, st.h, { unit: u });
    const bx = st.x + 84 * s;
    const by = st.y + 84 * s;
    const bw = 220 * s;
    const bh = 24 * s;
    const full = h.bagTotal >= h.bagCapacity - 0.001;
    // Like an HP bar: dark frame, dark inside, one block of colour per material.
    pixelRect(g, bx, by, bw, bh, u, 1, full ? 0xb02020 : COLORS.boxEdge);
    g.fillStyle(0x4a5068, 1).fillRect(bx + u, by + u, bw - 2 * u, bh - 2 * u);
    let x = bx + u;
    const inner = bw - 2 * u;
    for (const mat of MATERIAL_ORDER) {
      const amt = h.bagContents[mat] ?? 0;
      if (amt <= 0) continue;
      const w = Math.min(inner - (x - bx - u), (amt / h.bagCapacity) * inner);
      if (w <= 0) continue;
      const c = MATERIALS[mat].color;
      g.fillStyle(c, 1).fillRect(x, by + u, w, bh - 2 * u);
      g.fillStyle(Phaser.Display.Color.ValueToColor(c).lighten(18).color, 1).fillRect(x, by + u, w, u);
      x += w;
    }
    this.bagText.setText(`${h.bagTotal.toFixed(2)}/${h.bagCapacity.toFixed(2)}`);
    setTextColor(this.bagText, full ? COLORS.boxBad : COLORS.boxText);

    // Clock window, with the shift's progress and the coffee (noon) mark.
    const cb = this.clockBox;
    drawBox(p, cb.x, cb.y, cb.w, cb.h, { unit: u });
    const px = cb.x + 30 * s;
    const py = cb.y + 74 * s;
    const pw = cb.w - 60 * s;
    pixelRect(g, px, py, pw, 14 * s, u, 1, COLORS.boxEdge);
    g.fillStyle(0x4a5068, 1).fillRect(px + u, py + u, pw - 2 * u, 14 * s - 2 * u);
    g.fillStyle(COLORS.accent, 1).fillRect(px + u, py + u, Math.max(u, (pw - 2 * u) * h.progress), 14 * s - 2 * u);
    g.fillStyle(COLORS.boxEdge, 1).fillRect(px + pw * 0.5 - u / 2, py - 4 * s, u, 14 * s + 8 * s);

    // Warnings: three slots, filled red when used (like a trainer's party balls).
    const wb = this.warnBox;
    drawBox(p, wb.x, wb.y, wb.w, wb.h, { unit: u });
    while (this.strikes.length < h.maxWarnings) this.strikes.push(this.add.image(0, 0, UI_ICONS.strikeOff));
    const gap = Math.min(68 * s, (wb.w - 60 * s) / Math.max(1, h.maxWarnings - 1));
    this.strikes.forEach((img, i) => {
      const used = i < h.warnings;
      img.setVisible(i < h.maxWarnings).setTexture(used ? UI_ICONS.strikeOn : UI_ICONS.strikeOff);
      img.setPosition(wb.x + 52 * s + i * gap, wb.y + 66 * s).setScale((44 * s) / 48);
    });

    // Pause button.
    const pb = this.pauseBox;
    drawBox(p, pb.x, pb.y, pb.w, pb.h, { unit: u });
    const pcx = pb.x + pb.w / 2;
    const pcy = pb.y + pb.h / 2;
    g.fillStyle(COLORS.boxEdge, 1).fillRect(pcx - 14 * s, pcy - 18 * s, 10 * s, 36 * s).fillRect(pcx + 4 * s, pcy - 18 * s, 10 * s, 36 * s);

    // HIGH ALERT banner while the students are on the lookout.
    const alert = h.alert;
    const ab = this.alertBox;
    this.alertText.setVisible(!!alert);
    for (const a of this.alertIcons) a.setVisible(!!alert);
    if (alert) {
      const flash = Math.floor(time / 380) % 2 === 0;
      drawBox(p, ab.x, ab.y, ab.w, ab.h, { ...ALERT_STYLE, rim: flash ? 0xffe060 : ALERT_STYLE.rim, unit: u });
      this.alertText.setText(`HIGH ALERT  ${Math.ceil(alert.left)}s`);
      // Time left drains along the bottom.
      const lx = ab.x + 64 * s;
      const lw = ab.w - 128 * s;
      g.fillStyle(0x5a1010, 1).fillRect(lx, ab.y + ab.h - 18 * s, lw, 6 * s);
      g.fillStyle(0xffe060, 1).fillRect(lx, ab.y + ab.h - 18 * s, lw * Phaser.Math.Clamp(alert.left / Math.max(0.001, alert.total), 0, 1), 6 * s);
      for (const a of this.alertIcons) a.setScale(((40 + (flash ? 4 : 0)) * s) / 48);
    }

    // Dialog box (and where the prompt goes around it).
    if (!this.paused) this.dialogClock += delta / 1000;
    const view = this.dialog.update(this.dialogClock);
    this.drawDialog(view, time);
    let promptY = this.promptY;
    if (view && this.touch) promptY = Math.min(promptY, this.dialogBox.y - 44 * s);

    // Prompt
    if (h.prompt) {
      const verb = !this.touch && !h.promptBad && (h.action === 'UNLOCK' || h.action === 'SCRAP') ? '[E]  ' : '';
      setTextColor(this.promptText.setText(verb + h.prompt), h.promptBad ? COLORS.boxBad : COLORS.boxText).setVisible(true);
      const tw = this.promptText.width + 64 * s;
      // Keep clear of the ability box in the bottom-left corner (desktop).
      const promptX = !this.touch && h.ability ? Math.max(this.promptX, this.abilityRight + 16 * s + tw / 2) : this.promptX;
      this.promptText.setPosition(promptX, promptY);
      drawBox(p, promptX - tw / 2, promptY - 34 * s, tw, 68 * s, { unit: u, rim: h.promptBad ? 0xf0a090 : COLORS.boxRim });
    } else {
      this.promptText.setVisible(false);
    }

    // Ability (keyboard hint) / buttons (touch)
    if (h.ability) {
      const ready = h.ability.cooldownLeft <= 0;
      const active = h.ability.activeLeft > 0;
      if (!this.touch) {
        const ax = m;
        const ay = H - m - 38 * s;
        const label = active ? `${h.ability.name}  ${h.ability.activeLeft.toFixed(1)}s` : ready ? `[Q]  ${h.ability.name}` : `${h.ability.name}  ${Math.ceil(h.ability.cooldownLeft)}s`;
        setTextColor(this.abilityText.setText(label).setPosition(ax + 64 * s, ay - 2 * s), active ? '#6a3cb0' : ready ? COLORS.boxText : COLORS.boxMuted);
        const tw = this.abilityText.width + 92 * s;
        this.abilityRight = ax + tw;
        drawBox(p, ax, ay - 38 * s, tw, 76 * s, { unit: u, fill: active ? 0xece0ff : COLORS.box, rim: active || ready ? 0xb898f0 : COLORS.boxRim });
        this.icons.star.setPosition(ax + 36 * s, ay - 2 * s).setAlpha(ready || active ? 1 : 0.45);
        if (!ready && !active) {
          g.fillStyle(0x7e57c2, 1).fillRect(ax + 18 * s, ay + 22 * s, (tw - 36 * s) * (1 - h.ability.cooldownLeft / h.ability.cooldown), 5 * s);
        }
      } else {
        const z = this.abilityZone;
        const r = 76 * s;
        const pu = Math.max(2, Math.round(4 * s));
        const dim = ready || active ? 1 : 0.55;
        pixelCircle(g, z.x, z.y + pu, r + pu, { u: pu, color: COLORS.boxEdge, alpha: 0.9 * dim });
        pixelCircle(g, z.x, z.y, r - pu, { u: pu, color: active ? 0x9a6ce0 : 0x6a4aa8, alpha: 0.92 * dim });
        pixelCircle(g, z.x - r * 0.3, z.y - r * 0.35, r * 0.24, { u: pu, color: 0xffffff, alpha: 0.25 * dim });
        if (!ready && !active) {
          g.lineStyle(10 * s, 0xd8b8ff, 0.9).beginPath();
          g.arc(z.x, z.y, r - 14 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - h.ability.cooldownLeft / h.ability.cooldown));
          g.strokePath();
        }
        this.abilityBtnText.setText(ABILITY_SHORT[h.ability.key] ?? 'ABILITY').setAlpha(ready || active ? 1 : 0.5);
      }
    }

    if (this.touch) this.drawTouch(g, h, time);

    // Toasts slide into place under the clock (and the alert banner).
    let ty = this.clockTop + this.clockBox.h + 14 * s + (alert ? this.alertBox.h + 12 * s : 0);
    const k = Math.min(1, delta / 80);
    for (const t of this.toasts) {
      t.box.x = W / 2;
      t.box.y += (ty - t.box.y) * k;
      ty += t.text.height + 34 * s;
    }

    // Red edges while Mr. Gravy is on to you.
    const v = this.vignette.clear();
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
    const pu = Math.max(2, Math.round(4 * s));
    // Action button: a big round GBA-style button.
    const z = this.actionZone;
    const r = 112 * s;
    const enabled = !!h.action;
    const a = enabled ? 0.95 : 0.55;
    pixelCircle(g, z.x, z.y + 2 * pu, r + pu, { u: pu, color: COLORS.boxEdge, alpha: a });
    pixelCircle(g, z.x, z.y + pu, r - pu, { u: pu, color: enabled ? 0xb85f22 : 0x5a6078, alpha: a });
    pixelCircle(g, z.x, z.y - pu, r - 2 * pu, { u: pu, color: enabled ? COLORS.accent : 0x8088a0, alpha: a });
    pixelCircle(g, z.x - r * 0.32, z.y - r * 0.38, r * 0.22, { u: pu, color: 0xffffff, alpha: enabled ? 0.35 : 0.15 });
    if (enabled && h.action !== 'STOP') {
      g.lineStyle(4 * s, 0xffffff, 0.35 + 0.25 * Math.sin(time / 160)).strokeCircle(z.x, z.y, r + 12 * s);
    }
    this.actionText.setText(h.action ?? 'ACTION').setAlpha(enabled ? 1 : 0.5);

    // Joystick: floating where your thumb lands, with a faint hint when idle.
    const st = this.stick;
    const base = 120 * s;
    if (st.id >= 0) {
      pixelCircle(g, st.ox, st.oy, base, { u: pu, color: 0xffffff, alpha: 0.14 });
      pixelCircle(g, st.x, st.y, 56 * s, { u: pu, color: COLORS.boxEdge, alpha: 0.45 });
      pixelCircle(g, st.x, st.y, 56 * s - pu, { u: pu, color: 0xffffff, alpha: 0.6 });
    } else {
      const hx = 24 * s + base + 40 * s;
      const hy = this.H - 24 * s - base - 40 * s;
      pixelCircle(g, hx, hy, base, { u: pu, color: 0xffffff, alpha: 0.08 });
      pixelCircle(g, hx, hy, 56 * s, { u: pu, color: 0xffffff, alpha: 0.2 });
    }
  }

  // ---- dialog box --------------------------------------------------------

  private showDialog(line: DialogLine) {
    this.dialog.push(line, this.dialogClock);
  }

  private drawDialog(view: DialogView | null, time: number) {
    this.dialogLayer.setVisible(!!view);
    if (!view) {
      this.dialogShown = null;
      return;
    }
    const s = this.ui;
    const u = this.unit;
    const r = this.dialogBox;
    const pad = boxBorder(u) + 20 * s;
    const hasPortrait = !!view.line.portrait && this.textures.exists(view.line.portrait);
    const pSize = r.h - 2 * pad + 8 * s;
    const textX = r.x + pad + (hasPortrait ? pSize + 24 * s : 8 * s);
    const textW = r.x + r.w - pad - 36 * s - textX;

    // A new line: wrap it once (fitting at most 3 lines), so words don't jump while typing.
    if (!this.dialogShown || this.dialogShown.line !== view.line || this.dialogShown.width !== textW) {
      let size = (this.touch ? 34 : 36) * s;
      let lines: string[] = [];
      for (;;) {
        setTextSize(this.dialogText, size);
        this.dialogText.setWordWrapWidth(textW, true);
        lines = this.dialogText.getWrappedText(view.line.text);
        if (lines.length <= 3 || size <= 18 * s) break;
        size *= 0.9;
      }
      this.dialogText.setWordWrapWidth(null);
      this.dialogShown = { line: view.line, lines, width: textW };
      setTextSize(this.dialogName, 30 * s).setText(view.line.speaker.toUpperCase());
      if (hasPortrait) this.dialogPortrait.setTexture(view.line.portrait!);
    }

    // Text typed so far, line by line.
    let left = view.chars;
    const shown: string[] = [];
    for (const l of this.dialogShown.lines) {
      if (left <= 0) break;
      shown.push(l.slice(0, left));
      left -= l.length + (/\s$/.test(l) ? 0 : 1);
    }
    this.dialogText.setText(shown.join('\n')).setPosition(textX, r.y + pad - 2 * s);

    const g = this.dialogG.clear();
    drawBox(g, r.x, r.y, r.w, r.h, { unit: u });
    // Portrait in its own little frame on the left.
    this.dialogPortrait.setVisible(hasPortrait);
    if (hasPortrait) {
      const fx = r.x + pad - 4 * s;
      const fy = r.y + (r.h - pSize) / 2;
      drawBox(g, fx, fy, pSize, pSize, { unit: u, fill: 0xdfe9f5 });
      const fit = pSize - 2 * boxBorder(u) - 6 * s;
      const src = this.dialogPortrait.frame;
      this.dialogPortrait.setPosition(fx + pSize / 2, fy + pSize / 2).setScale(fit / Math.max(src.width, src.height));
    }
    // Speaker name tab on the top edge.
    const tabH = 50 * s;
    const tabW = this.dialogName.width + 48 * s;
    const tabX = r.x + 28 * s;
    const tabY = r.y - tabH + 14 * s;
    drawBox(g, tabX, tabY, tabW, tabH, { unit: u, rim: null, fill: COLORS.box });
    this.dialogName.setPosition(tabX + 24 * s, tabY + tabH / 2 - 1 * s);
    // Blinking ▼ once the line is typed.
    if (view.typed && Math.floor(time / 420) % 2 === 0) drawMoreArrow(g, r.x + r.w - pad - 10 * s, r.y + r.h - pad + 4 * s, 16 * s);
  }

  // ---- touch joystick ----------------------------------------------------

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    unlockAudio();
    if (p.wasTouch && !this.touch) {
      this.touch = true;
      this.layout();
    }
    // A tap on the dialog box skips / closes it (the joystick still works from there).
    if (!this.paused && this.dialog.open && inside(this.dialogBox, p.x, p.y)) this.dialogTap = { id: p.id, x: p.x, y: p.y, t: p.downTime };
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
    const tap = this.dialogTap;
    if (tap && tap.id === p.id) {
      this.dialogTap = null;
      if (Math.hypot(p.x - tap.x, p.y - tap.y) < 24 * this.ui && p.upTime - tap.t < 500) this.dialog.advance(this.dialogClock);
    }
    if (p.id !== this.stick.id) return;
    this.stick.id = -1;
    controls.touchMove = { x: 0, y: 0 };
  }

  private onKey(e: KeyboardEvent) {
    unlockAudio();
    if (this.paused) {
      // Ignore the same key press that opened the menu.
      if (this.game.loop.frame === this.pausedFrame) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.resume();
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.selectPause(this.pauseIndex - 1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.selectPause(this.pauseIndex + 1);
      else if (e.key === 'Enter' || e.key === ' ') this.pauseButtons[this.pauseIndex]?.run();
      return;
    }
    // The action key also moves the dialog along (the game still gets it too).
    if (this.dialog.open && (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter')) this.dialog.advance(this.dialogClock);
  }

  // ---- toasts ------------------------------------------------------------

  private showToast(text: string, color: string, duration: number) {
    const t = this.add.text(0, 0, text, textStyle(34 * this.ui, color, { align: 'center' })).setOrigin(0.5, 0);
    const bg = this.add.graphics();
    const box = this.add.container(this.W / 2, this.clockTop + this.clockBox.h + 14 * this.ui, [bg, t]).setAlpha(0).setDepth(60);
    const toast: Toast = { box, text: t, bg };
    this.styleToast(toast);
    // New toasts start where the last one is, then settle into place.
    const last = this.toasts[this.toasts.length - 1];
    if (last) box.y = last.box.y + last.text.height + 34 * this.ui;
    this.toasts.push(toast);
    this.tweens.add({ targets: box, alpha: 1, duration: 160 });
    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: box,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          this.toasts = this.toasts.filter((x) => x !== toast);
          box.destroy();
        },
      });
    });
  }

  /** Sizes a toast's text and window for the current HUD scale. */
  private styleToast(t: Toast) {
    const s = this.ui;
    // Landscape: toasts sit beside the status window, so they stay narrower than the gap to it.
    const side = this.statusBox.x + this.statusBox.w + 16 * s;
    const wrap = isPortrait(this.scale) ? this.W - 104 * s : this.W - 2 * side - 56 * s;
    setTextSize(t.text, 34 * s).setWordWrapWidth(Math.min(wrap, 1300 * s));
    const w = t.text.width + 56 * s;
    const h = t.text.height + 24 * s;
    t.text.setPosition(0, 12 * s);
    drawBox(t.bg.clear(), -w / 2, 0, w, h, { ...TOAST_STYLE, unit: this.unit });
  }

  // ---- pause -------------------------------------------------------------

  private showPause() {
    this.paused = true;
    this.pausedFrame = this.game.loop.frame;
    this.stick.id = -1;
    this.dialogTap = null;
    controls.reset();
    this.pauseIndex = 0;
    this.buildPauseMenu();
  }

  private buildPauseMenu() {
    const W = this.W;
    const H = this.H;
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x0b0f1c, 0.7).setInteractive();
    // Menu content is laid out around (0, 0) and scaled up on small screens.
    const k = Math.max(1, this.ui * 0.9);
    const win = this.add.graphics();
    drawBox(win, -320, -390, 640, 724, { unit: 6 });
    const title = this.add.text(0, -322, 'PAUSED', textStyle(72, COLORS.boxText, { fontStyle: '700' })).setOrigin(0.5);
    const help = this.touch
      ? 'Left thumb: move\nSCRAP button: scrap / unlock\nHIDE: ability'
      : 'WASD / arrows: move\nE or Space: scrap / unlock\nQ: ability  ·  Esc: pause';
    const helpText = this.add.text(0, -218, help, textStyle(24, COLORS.boxMuted, { align: 'center', lineSpacing: 4 })).setOrigin(0.5);
    const opts = { width: 480, height: 92, fontSize: 36 };
    const toggleSound = () => {
      setMuted(!isMuted());
      updateSave((d) => (d.muted = isMuted()));
      sound.label.setText(isMuted() ? 'SOUND: OFF' : 'SOUND: ON');
      sfx.click();
    };
    const resume = new Button(this, 0, -90, 'RESUME', () => this.resume(), { ...opts, ...BUTTON_PRIMARY });
    const restart = new Button(this, 0, 22, 'RESTART SHIFT', () => this.restartShift(), { ...opts, ...BUTTON_SECONDARY });
    const sound = new Button(this, 0, 134, isMuted() ? 'SOUND: OFF' : 'SOUND: ON', toggleSound, { ...opts, ...BUTTON_SECONDARY });
    const quit = new Button(this, 0, 246, 'QUIT TO MENU', () => this.quit(), { ...opts, ...BUTTON_SECONDARY });
    this.pauseButtons = [
      { button: resume, run: () => this.resume() },
      { button: restart, run: () => this.restartShift() },
      { button: sound, run: toggleSound },
      { button: quit, run: () => this.quit() },
    ];
    const content = this.add.container(W / 2, H / 2, [win, title, helpText, resume, restart, sound, quit]);
    // Fit the window on short screens (phones held sideways).
    content.setScale(Math.min(k, (H * 0.94) / 724, (W * 0.94) / 640));
    content.y = H / 2 + 28 * content.scale;
    this.pauseMenu = this.add.container(0, 0, [dim, content]).setDepth(100);
    this.selectPause(this.pauseIndex);
  }

  private selectPause(i: number) {
    const n = this.pauseButtons.length;
    if (!n) return;
    this.pauseIndex = ((i % n) + n) % n;
    this.pauseButtons.forEach((b, j) => b.button.setSelected(j === this.pauseIndex));
  }

  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    this.pauseButtons = [];
    controls.reset();
    this.scene.resume('Game');
  }

  private restartShift() {
    const character = this.gameScene.player.character.id;
    this.scene.start('Game', { character, mapText: this.gameScene.mapText });
  }

  private quit() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
