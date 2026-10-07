import Phaser from 'phaser';
import { ABILITIES, CHARACTERS, CHARACTER_ORDER } from '../config/characters';
import { oncePerKeyEvent } from '../input/Controls';
import { sfx, unlockAudio } from '../systems/sfx';
import { loadSave, updateSave } from '../systems/save';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Button, COLORS, drawBox, drawCursor, fitColumn, fitWidth, isPortrait, isTouchDevice, money, textStyle } from '../ui/theme';
import { addTileLayers } from '../world/World';
import { parseMap } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';

interface Card {
  id: string;
  frame: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  x: number;
  y: number;
  w: number;
  h: number;
  compact: boolean;
}

/** Dark wash over the backdrop so the windows stand out. */
const BACKDROP_DIM = { color: 0x141a30, alpha: 0.62 };

/**
 * The school itself, drawn from the map file and slowly panning, as the backdrop of the menu
 * screens. Covers the area 0,0 - W,H (in the scene's camera space).
 */
export function addSchoolBackdrop(scene: Phaser.Scene, W: number, H: number): void {
  scene.add.rectangle(0, 0, W, H, 0x1c2238).setOrigin(0).setDepth(-12);
  try {
    const map = parseMap(DEFAULT_MAP.text);
    const { floor, walls } = addTileLayers(scene, map);
    const mapW = floor.width;
    const mapH = floor.height;
    const scale = Math.max((W * 1.25) / mapW, H / (mapH * 0.62));
    const travelX = Math.max(0, mapW * scale - W);
    const y = -(mapH * scale - H) * 0.35;
    for (const layer of [floor, walls]) {
      layer.setScale(scale).setPosition(0, y).setDepth(layer === floor ? -11 : -10);
      scene.tweens.add({ targets: layer, x: -travelX, duration: 40000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  } catch {
    // A broken map file: the plain colour is fine (the menu says what's wrong).
  }
  scene.add.rectangle(0, 0, W, H, BACKDROP_DIM.color, BACKDROP_DIM.alpha).setOrigin(0).setDepth(-9);
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

    addSchoolBackdrop(this, W, H);
    if (this.notice) {
      const t = this.add
        .text(W / 2, top + 22, this.notice, textStyle(26, COLORS.boxBad, { align: 'center', wordWrap: { width: Math.min(W - 120, 1560) } }))
        .setOrigin(0.5, 0)
        .setDepth(11);
      drawBox(this.add.graphics().setDepth(10), W / 2 - t.width / 2 - 28, top + 6, t.width + 56, t.height + 32, { unit: 4 });
    }

    // Title
    this.add.text(cx, top + 66, 'PROJECT', textStyle(50, COLORS.text, { fontStyle: '700' })).setOrigin(0.5, 0);
    const title = this.add
      .text(cx, top + 104, 'COPPER', textStyle(portrait ? 190 : 170, COLORS.copper, { fontStyle: '700', strokeThickness: 18, shadow: { offsetX: 10, offsetY: 10, color: COLORS.ink, blur: 0, stroke: true, fill: true } }))
      .setOrigin(0.5, 0);
    this.tweens.add({ targets: title, y: title.y - 8, yoyo: true, repeat: -1, duration: 900, ease: 'Stepped', easeParams: [4] });
    const tagline = "Strip the school for scrap. Get it to the van. Don't let Mr. Gravy catch you.";
    const tagY = top + (portrait ? 330 : 296);
    const tag = this.add
      .text(cx, tagY, tagline, textStyle(portrait ? 38 : 30, COLORS.boxText, { align: 'center', wordWrap: portrait ? { width: 880 } : undefined }))
      .setOrigin(0.5, 0);
    if (!portrait) fitWidth(tag, 1420);
    drawBox(this.add.graphics(), cx - tag.width / 2 - 36, tagY - 20, tag.width + 72, tag.height + 40, { unit: 4 });
    tag.setDepth(1);

    // Crew cards
    let buttonY: number;
    if (portrait) {
      const cardW = 960;
      const cardH = 300;
      const y0 = top + 450;
      CHARACTER_ORDER.forEach((id, i) => this.buildCard(id, cx - cardW / 2, y0 + i * (cardH + 28), cardW, cardH, true));
      buttonY = y0 + CHARACTER_ORDER.length * (cardH + 28) + 90;
    } else {
      const cardW = 400;
      const cardH = 468;
      const gap = 36;
      const totalW = CHARACTER_ORDER.length * cardW + (CHARACTER_ORDER.length - 1) * gap;
      CHARACTER_ORDER.forEach((id, i) => this.buildCard(id, cx - totalW / 2 + i * (cardW + gap), 380, cardW, cardH, false));
      buttonY = 380 + cardH + 92;
    }
    this.refreshCards();

    // START SHIFT with the (secondary) MAP EDITOR beside it in landscape, under it in portrait.
    const editor = { ...BUTTON_SECONDARY, fontSize: portrait ? 44 : 38 };
    if (portrait) {
      new Button(this, cx, buttonY, 'START SHIFT', () => this.play(), { ...BUTTON_PRIMARY, width: 700, height: 112, fontSize: 52 }).setSelected(true);
      buttonY += 132;
      new Button(this, cx, buttonY, 'MAP EDITOR', () => this.openEditor(), { ...editor, width: 520, height: 96 });
    } else {
      const gap = 40;
      const startW = 520;
      const editorW = 360;
      const left = cx - (startW + gap + editorW) / 2;
      new Button(this, left + startW / 2, buttonY, 'START SHIFT', () => this.play(), { ...BUTTON_PRIMARY, width: startW, height: 112, fontSize: 52 }).setSelected(true);
      new Button(this, left + startW + gap + editorW / 2, buttonY, 'MAP EDITOR', () => this.openEditor(), { ...editor, width: editorW, height: 96 });
    }

    // The van and Mr. Gravy keep an eye on things from the corners.
    if (portrait) {
      if (H - (buttonY + 300) > 150) this.add.image(cx, H - 110, 'van_big').setScale(0.5);
    } else {
      this.add.image(W - 210, buttonY - 12, 'van_big').setScale(0.6);
      this.add.image(190, buttonY - 6, 'mr_gravy_big').setScale(0.8);
    }

    const help = isTouchDevice()
      ? `Left thumb moves  ·  big button scraps  ·  bring scrap to the white van to sell it${portrait ? '  ·  turn sideways for a wider view' : ''}`
      : 'WASD / arrows move  ·  E scraps  ·  Q uses your ability  ·  bring scrap to the white van to sell it';
    const footY = portrait ? buttonY + 90 : H - 74;
    const helpText = this.add.text(cx, footY, help, textStyle(portrait ? 34 : 26, COLORS.text, { align: 'center', wordWrap: portrait ? { width: 900 } : undefined })).setOrigin(0.5, 0);
    if (!portrait) fitWidth(helpText, Math.min(W - 800, 1500));
    if (save.bestShift > 0) {
      this.add
        .text(cx, portrait ? footY + 130 : H - 30, `Best shift: ${money(save.bestShift)}   ·   Lifetime: ${money(save.totalEarned)}`, textStyle(portrait ? 32 : 24, COLORS.copper))
        .setOrigin(0.5);
    }

    const kb = this.input.keyboard!;
    kb.on(
      'keydown',
      oncePerKeyEvent((e: KeyboardEvent) => {
        unlockAudio();
        const i = CHARACTER_ORDER.indexOf(this.selected);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a') this.select(CHARACTER_ORDER[(i + CHARACTER_ORDER.length - 1) % CHARACTER_ORDER.length]);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd') this.select(CHARACTER_ORDER[(i + 1) % CHARACTER_ORDER.length]);
        if (e.key === 'Enter' || e.key === ' ') this.play();
      }),
    );
    this.input.on('pointerdown', () => unlockAudio());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.cameras.main.fadeIn(300, 20, 22, 28);
  }

  private onResize() {
    this.scene.restart();
  }

  private buildCard(id: string, x: number, y: number, w: number, h: number, compact: boolean) {
    const c = CHARACTERS[id];
    const frame = this.add.graphics();
    const stats: [string, number][] = [
      ['SPEED', c.stats.speed],
      ['REPAIR', c.stats.repair],
      ['CARRY', c.stats.carry],
    ];
    const ability = c.ability ? ABILITIES[c.ability].name : 'No special ability (yet)';
    const abilityColor = c.ability ? '#6a3cb0' : COLORS.boxMuted;
    const pips = this.add.graphics();
    // Stats as little bars, like a GBA status screen.
    const drawPips = (sx: number, sy: number, value: number) => {
      for (let p = 0; p < 3; p++) {
        drawBox(pips, sx + p * 54, sy - 13, 48, 26, { unit: 3, rim: null, fill: p < value ? c.color : 0xd8d4c8 });
      }
    };
    // Portrait in a light blue frame (the art faces the camera, upright).
    const pSize = compact ? 236 : 184;
    const px = compact ? x + 32 : x + (w - pSize) / 2;
    const py = compact ? y + (h - pSize) / 2 : y + 26;
    const pf = this.add.graphics();
    drawBox(pf, px, py, pSize, pSize, { unit: 4, fill: 0xdfe9f5 });
    const portrait = this.add.image(px + pSize / 2, py + pSize / 2, `${c.sprite}_big`);
    portrait.setScale((pSize - 34) / Math.max(portrait.width, portrait.height));

    let name: Phaser.GameObjects.Text;
    if (compact) {
      const tx = x + 300;
      // Portrait phones show this column small: bigger text.
      name = this.add.text(tx, y + 26, c.name.toUpperCase(), textStyle(60, COLORS.boxText, { fontStyle: '700' })).setOrigin(0, 0);
      fitWidth(this.add.text(tx, y + 98, c.tagline, textStyle(32, COLORS.boxMuted)).setOrigin(0, 0), x + w - 34 - tx);
      const pipsX = tx + 130;
      stats.forEach(([label, value], i) => {
        const sy = y + 164 + i * 42;
        this.add.text(tx, sy, label, textStyle(30, COLORS.boxText)).setOrigin(0, 0.5);
        drawPips(pipsX, sy, value);
      });
      // Beside the last row of pips, never over them.
      const pipsRight = pipsX + 2 * 54 + 48 + 24;
      fitWidth(this.add.text(x + w - 30, y + h - 26, ability, textStyle(30, abilityColor)).setOrigin(1, 1), x + w - 30 - pipsRight);
    } else {
      const mid = x + w / 2;
      name = this.add.text(mid, y + 222, c.name.toUpperCase(), textStyle(48, COLORS.boxText, { fontStyle: '700' })).setOrigin(0.5, 0);
      fitWidth(this.add.text(mid, y + 278, c.tagline, textStyle(24, COLORS.boxMuted)).setOrigin(0.5, 0), w - 44);
      stats.forEach(([label, value], i) => {
        const sy = y + 330 + i * 36;
        this.add.text(x + 42, sy, label, textStyle(24, COLORS.boxText)).setOrigin(0, 0.5);
        drawPips(x + 196, sy, value);
      });
      fitWidth(this.add.text(mid, y + h - 22, ability, textStyle(24, abilityColor)).setOrigin(0.5, 1), w - 44);
    }

    // Windows go under the texts drawn above.
    frame.setDepth(-1);
    this.cards.push({ id, frame, portrait, name, x, y, w, h, compact });

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
      const on = card.id === this.selected;
      const g = card.frame.clear();
      if (on) drawBox(g, card.x - 6, card.y - 6, card.w + 12, card.h + 12, { unit: 6, fill: COLORS.accentFill, rim: COLORS.accent });
      else drawBox(g, card.x, card.y, card.w, card.h, { unit: 5 });
      // The ▶ cursor points at the chosen one.
      if (on) {
        const n = card.name;
        drawCursor(g, n.x - n.width * n.originX - 12, n.y + n.height * (0.5 - n.originY), 30);
      }
      // The chosen one hops, like a party slot in the GBA games.
      this.tweens.killTweensOf(card.portrait);
      const base = card.compact ? card.y + card.h / 2 : card.y + 26 + 92;
      card.portrait.y = base;
      if (on) this.tweens.add({ targets: card.portrait, y: base - 8, yoyo: true, repeat: -1, duration: 260, ease: 'Stepped', easeParams: [1], hold: 260, repeatDelay: 260 });
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
