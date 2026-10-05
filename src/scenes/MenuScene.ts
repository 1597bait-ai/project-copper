import Phaser from 'phaser';
import { ABILITIES, CHARACTERS, CHARACTER_ORDER } from '../config/characters';
import { sfx, unlockAudio } from '../systems/sfx';
import { loadSave, updateSave } from '../systems/save';
import { Button, COLORS, isTouchDevice, money, textStyle } from '../ui/theme';

/** Title screen + crew select. */
export class MenuScene extends Phaser.Scene {
  private selected = 'dalton';
  private starting = false;
  private cards: { id: string; frame: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number }[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    const save = loadSave();
    this.starting = false;
    this.selected = CHARACTERS[save.character] ? save.character : 'dalton';
    this.cards = [];
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    this.drawBackground(W, H);

    // Title
    this.add.text(cx, 70, 'PROJECT', textStyle(46, COLORS.muted)).setOrigin(0.5, 0);
    const title = this.add.text(cx, 112, 'COPPER', textStyle(150, COLORS.copper, { strokeThickness: 18 })).setOrigin(0.5, 0);
    title.setShadow(0, 10, '#000000', 0, true, true);
    this.tweens.add({ targets: title, scale: { from: 1, to: 1.03 }, yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.InOut' });
    this.add
      .text(cx, 290, 'Strip the school for scrap. Get it to the van. Don\'t let Mr. Gravy catch you.', textStyle(30, COLORS.text))
      .setOrigin(0.5, 0);

    // Crew cards
    const cardW = 400;
    const cardH = 440;
    const gap = 36;
    const totalW = CHARACTER_ORDER.length * cardW + (CHARACTER_ORDER.length - 1) * gap;
    const top = 370;
    CHARACTER_ORDER.forEach((id, i) => {
      const x = cx - totalW / 2 + i * (cardW + gap);
      this.buildCard(id, x, top, cardW, cardH);
    });
    this.refreshCards();

    // Play
    new Button(this, cx, top + cardH + 110, 'START SHIFT', () => this.play(), { width: 520, height: 112, fontSize: 52 });

    const help = isTouchDevice()
      ? 'Left thumb moves  ·  big button scraps  ·  bring scrap to the white van to sell it'
      : 'WASD / arrows move  ·  E scraps  ·  Q uses your ability  ·  bring scrap to the white van to sell it';
    this.add.text(cx, H - 70, help, textStyle(24, COLORS.muted)).setOrigin(0.5);
    if (save.bestShift > 0) {
      this.add.text(cx, H - 34, `Best shift: ${money(save.bestShift)}   ·   Lifetime: ${money(save.totalEarned)}`, textStyle(22, COLORS.copper)).setOrigin(0.5);
    }

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      unlockAudio();
      const i = CHARACTER_ORDER.indexOf(this.selected);
      if (e.key === 'ArrowLeft' || e.key === 'a') this.select(CHARACTER_ORDER[(i + CHARACTER_ORDER.length - 1) % CHARACTER_ORDER.length]);
      if (e.key === 'ArrowRight' || e.key === 'd') this.select(CHARACTER_ORDER[(i + 1) % CHARACTER_ORDER.length]);
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

  private buildCard(id: string, x: number, y: number, w: number, h: number) {
    const c = CHARACTERS[id];
    const frame = this.add.graphics();
    this.cards.push({ id, frame, x, y, w, h });
    const mid = x + w / 2;
    this.add.image(mid, y + 110, `${c.sprite}_big`).setRotation(-Math.PI / 2).setScale(0.9);
    this.add.text(mid, y + 214, c.name.toUpperCase(), textStyle(44)).setOrigin(0.5, 0);
    this.add.text(mid, y + 266, c.tagline, textStyle(20, COLORS.muted)).setOrigin(0.5, 0);
    const stats: [string, number][] = [
      ['SPEED', c.stats.speed],
      ['REPAIR', c.stats.repair],
      ['CARRY', c.stats.carry],
    ];
    const pips = this.add.graphics();
    stats.forEach(([label, value], i) => {
      const sy = y + 312 + i * 34;
      this.add.text(x + 40, sy, label, textStyle(22)).setOrigin(0, 0.5);
      for (let p = 0; p < 3; p++) {
        pips.fillStyle(p < value ? c.color : 0x000000, p < value ? 1 : 0.45).fillRoundedRect(x + 200 + p * 52, sy - 11, 44, 22, 6);
      }
    });
    const ability = c.ability ? ABILITIES[c.ability].name : 'No special ability (yet)';
    this.add.text(mid, y + h - 22, ability, textStyle(20, c.ability ? '#c9a7ff' : COLORS.muted)).setOrigin(0.5, 1);
    const hit = this.add.zone(mid, y + h / 2, w, h).setInteractive({ useHandCursor: true });
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
