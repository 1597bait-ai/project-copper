import Phaser from 'phaser';
import { ABILITIES, CHARACTERS, CHARACTER_ORDER } from '../config/characters';
import { sfx, unlockAudio } from '../systems/sfx';
import { loadSave, updateSave } from '../systems/save';
import { Button, COLORS, fitColumn, isPortrait, isTouchDevice, money, textStyle } from '../ui/theme';

interface Card {
  id: string;
  frame: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Title screen + crew select. Cards sit in a row in landscape and stack in portrait. */
export class MenuScene extends Phaser.Scene {
  private selected = 'dalton';
  private starting = false;
  private cards: Card[] = [];

  /** A problem to show on the menu (e.g. the map file can't be played). */
  private notice: string | null = null;

  constructor() {
    super('Menu');
  }

  init(data?: { notice?: string }): void {
    this.notice = data?.notice ?? null;
  }

  create(): void {
    const save = loadSave();
    this.starting = false;
    this.selected = CHARACTERS[save.character] ? save.character : 'dalton';
    this.cards = [];
    const portrait = isPortrait(this.scale);
    if (!portrait) this.cameras.main.setZoom(1).setScroll(0, 0);
    const columnH = 1900;
    const { width: W, height: H } = portrait ? fitColumn(this, 1080, columnH) : { width: this.scale.width, height: this.scale.height };
    const cx = W / 2;
    // Portrait content is a 1080-wide column, vertically centred.
    const top = portrait ? Math.max(0, (H - columnH) / 2) : 0;

    this.drawBackground(W, H);
    if (this.notice) {
      this.add
        .text(W / 2, top + 18, this.notice, textStyle(26, COLORS.bad, { align: 'center', wordWrap: { width: Math.min(W - 80, 1600) } }))
        .setOrigin(0.5, 0)
        .setDepth(10);
    }

    // Title
    this.add.text(cx, top + 70, 'PROJECT', textStyle(46, COLORS.muted)).setOrigin(0.5, 0);
    const title = this.add
      .text(cx, top + 112, 'COPPER', textStyle(portrait ? 170 : 150, COLORS.copper, { strokeThickness: 18 }))
      .setOrigin(0.5, 0);
    title.setShadow(0, 10, '#000000', 0, true, true);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.03 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.InOut' });
    const tagline = "Strip the school for scrap. Get it to the van. Don't let Mr. Gravy catch you.";
    this.add
      .text(cx, top + (portrait ? 320 : 290), tagline, textStyle(30, COLORS.text, { align: 'center', wordWrap: { width: portrait ? 900 : 1600 } }))
      .setOrigin(0.5, 0);

    // Crew cards
    let buttonY: number;
    if (portrait) {
      const cardW = 960;
      const cardH = 300;
      const y0 = top + 440;
      CHARACTER_ORDER.forEach((id, i) => this.buildCard(id, cx - cardW / 2, y0 + i * (cardH + 28), cardW, cardH, true));
      buttonY = y0 + CHARACTER_ORDER.length * (cardH + 28) + 90;
    } else {
      const cardW = 400;
      const cardH = 440;
      const gap = 36;
      const totalW = CHARACTER_ORDER.length * cardW + (CHARACTER_ORDER.length - 1) * gap;
      CHARACTER_ORDER.forEach((id, i) => this.buildCard(id, cx - totalW / 2 + i * (cardW + gap), 370, cardW, cardH, false));
      buttonY = 370 + cardH + 110;
    }
    this.refreshCards();

    // START SHIFT with the (secondary, grey) MAP EDITOR beside it in landscape, under it in portrait.
    const editor = { fill: 0x3d4558, fontSize: 38 };
    if (portrait) {
      new Button(this, cx, buttonY, 'START SHIFT', () => this.play(), { width: 700, height: 112, fontSize: 52 });
      buttonY += 132;
      new Button(this, cx, buttonY, 'MAP EDITOR', () => this.openEditor(), { ...editor, width: 480, height: 88 });
    } else {
      const gap = 40;
      const startW = 520;
      const editorW = 360;
      const left = cx - (startW + gap + editorW) / 2;
      new Button(this, left + startW / 2, buttonY, 'START SHIFT', () => this.play(), { width: startW, height: 112, fontSize: 52 });
      new Button(this, left + startW + gap + editorW / 2, buttonY, 'MAP EDITOR', () => this.openEditor(), { ...editor, width: editorW, height: 96 });
    }

    const help = isTouchDevice()
      ? `Left thumb moves  ·  big button scraps  ·  bring scrap to the white van to sell it${portrait ? '  ·  turn sideways for a wider view' : ''}`
      : 'WASD / arrows move  ·  E scraps  ·  Q uses your ability  ·  bring scrap to the white van to sell it';
    const footY = portrait ? buttonY + 90 : H - 70;
    this.add.text(cx, footY, help, textStyle(24, COLORS.muted, { align: 'center', wordWrap: { width: portrait ? 900 : 1800 } })).setOrigin(0.5, 0);
    if (save.bestShift > 0) {
      this.add
        .text(cx, portrait ? footY + 100 : H - 34, `Best shift: ${money(save.bestShift)}   ·   Lifetime: ${money(save.totalEarned)}`, textStyle(22, COLORS.copper))
        .setOrigin(0.5);
    }

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      unlockAudio();
      const i = CHARACTER_ORDER.indexOf(this.selected);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a') this.select(CHARACTER_ORDER[(i + CHARACTER_ORDER.length - 1) % CHARACTER_ORDER.length]);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd') this.select(CHARACTER_ORDER[(i + 1) % CHARACTER_ORDER.length]);
      if (e.key === 'Enter' || e.key === ' ') this.play();
    });
    this.input.on('pointerdown', () => unlockAudio());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.cameras.main.fadeIn(300, 20, 22, 28);
  }

  private onResize() {
    this.scene.restart();
  }

  private drawBackground(W: number, H: number) {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1d2230, 0x1d2230, 0x0f1117, 0x0f1117, 1).fillRect(0, 0, W, H);
    // Big faint copper coil behind the title.
    for (let r = 140; r < 900; r += 70) g.lineStyle(14, 0xe0823d, 0.05).strokeCircle(W / 2, 220, r);
    this.add.image(W - 190, H - 250, 'van_big').setRotation(Math.PI / 2).setAlpha(0.18).setScale(0.9);
    this.add.image(170, H - 210, 'mr_gravy_big').setRotation(-0.4).setAlpha(0.14);
  }

  private buildCard(id: string, x: number, y: number, w: number, h: number, compact: boolean) {
    const c = CHARACTERS[id];
    const frame = this.add.graphics();
    this.cards.push({ id, frame, x, y, w, h });
    const stats: [string, number][] = [
      ['SPEED', c.stats.speed],
      ['REPAIR', c.stats.repair],
      ['CARRY', c.stats.carry],
    ];
    const ability = c.ability ? ABILITIES[c.ability].name : 'No special ability (yet)';
    const abilityColor = c.ability ? '#c9a7ff' : COLORS.muted;
    const pips = this.add.graphics();
    const drawPips = (sx: number, sy: number, value: number) => {
      for (let p = 0; p < 3; p++) {
        pips.fillStyle(p < value ? c.color : 0x000000, p < value ? 1 : 0.45).fillRoundedRect(sx + p * 52, sy - 11, 44, 22, 6);
      }
    };

    if (compact) {
      // Portrait: portrait on the left, details on the right.
      this.add.image(x + 140, y + h / 2, `${c.sprite}_big`).setRotation(-Math.PI / 2).setScale(0.95);
      const tx = x + 290;
      this.add.text(tx, y + 26, c.name.toUpperCase(), textStyle(48)).setOrigin(0, 0);
      this.add.text(tx, y + 86, c.tagline, textStyle(24, COLORS.muted)).setOrigin(0, 0);
      stats.forEach(([label, value], i) => {
        const sy = y + 150 + i * 36;
        this.add.text(tx, sy, label, textStyle(22)).setOrigin(0, 0.5);
        drawPips(tx + 140, sy, value);
      });
      this.add.text(x + w - 30, y + h - 26, ability, textStyle(22, abilityColor)).setOrigin(1, 1);
    } else {
      const mid = x + w / 2;
      this.add.image(mid, y + 110, `${c.sprite}_big`).setRotation(-Math.PI / 2).setScale(0.9);
      this.add.text(mid, y + 214, c.name.toUpperCase(), textStyle(44)).setOrigin(0.5, 0);
      this.add.text(mid, y + 266, c.tagline, textStyle(20, COLORS.muted)).setOrigin(0.5, 0);
      stats.forEach(([label, value], i) => {
        const sy = y + 312 + i * 34;
        this.add.text(x + 40, sy, label, textStyle(22)).setOrigin(0, 0.5);
        drawPips(x + 200, sy, value);
      });
      this.add.text(mid, y + h - 22, ability, textStyle(20, abilityColor)).setOrigin(0.5, 1);
    }

    const hit = this.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (this.selected === id) this.play();
      else this.select(id);
    });
  }

  private select(id: string) {
    if (this.selected === id) return;
    this.selected = id;
    sfx.click();
    this.refreshCards();
  }

  private refreshCards() {
    for (const card of this.cards) {
      const c = CHARACTERS[card.id];
      const on = card.id === this.selected;
      const g = card.frame;
      g.clear();
      g.fillStyle(0x12151c, on ? 0.95 : 0.7).fillRoundedRect(card.x, card.y, card.w, card.h, 24);
      g.lineStyle(on ? 8 : 3, on ? c.color : 0x3a4152, 1).strokeRoundedRect(card.x, card.y, card.w, card.h, 24);
      if (on) g.fillStyle(c.color, 0.12).fillRoundedRect(card.x, card.y, card.w, card.h, 24);
    }
  }

  private openEditor() {
    if (this.starting) return;
    this.starting = true;
    unlockAudio();
    sfx.click();
    // The editor's PLAY (and the menu rebuilt by BACK) use the saved crew member.
    updateSave((d) => (d.character = this.selected));
    this.cameras.main.fadeOut(200, 20, 22, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Editor'));
  }

  private play() {
    if (this.starting) return;
    this.starting = true;
    unlockAudio();
    sfx.click();
    updateSave((d) => (d.character = this.selected));
    this.cameras.main.fadeOut(250, 20, 22, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Game', { character: this.selected }));
  }
}
