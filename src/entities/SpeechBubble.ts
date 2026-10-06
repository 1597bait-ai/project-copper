import Phaser from 'phaser';
import { PX } from '../art/pixel';
import { DEPTH } from '../ui/depth';
import { textStyle } from '../ui/theme';

// Pokemon Gen 3 style speech bubbles and '!' / '?' emotes over people's heads: white boxes with a
// dark border one art pixel thick and stepped (pixel-rounded) corners, drawn on the art pixel grid.

const INK = 0x283040;
const PAPER = 0xffffff;
/** The light inner edge along the bottom, like a Gen 3 text box. */
const PAPER_SHADE = 0xdfe3ea;
const TEXT_COLOR = '#283040';
const SHOUT_COLOR = '#c0303a';

/** A box with a 1 art pixel border and stepped corners, `w` x `h` screen px (multiples of PX). */
export function drawPixelBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const P = PX;
  g.fillStyle(INK, 1)
    .fillRect(x + 2 * P, y, w - 4 * P, h)
    .fillRect(x + P, y + P, w - 2 * P, h - 2 * P)
    .fillRect(x, y + 2 * P, w, h - 4 * P);
  g.fillStyle(PAPER, 1)
    .fillRect(x + 2 * P, y + P, w - 4 * P, h - 2 * P)
    .fillRect(x + P, y + 2 * P, w - 2 * P, h - 4 * P);
  g.fillStyle(PAPER_SHADE, 1).fillRect(x + 2 * P, y + h - 2 * P, w - 4 * P, P);
}

/** The little tail under a box, its tip at (0, 0): drawn over the box's bottom border so they join. */
const TAIL = ['KWWWK', '.KWK.', '..K..'];

function drawTail(g: Phaser.GameObjects.Graphics, rowsAbove: number) {
  TAIL.forEach((row, r) => {
    [...row].forEach((c, i) => {
      if (c === '.') return;
      g.fillStyle(c === 'K' ? INK : PAPER, 1).fillRect((i - 2) * PX - PX / 2, (r - rowsAbove) * PX, PX, PX);
    });
  });
}

const snap = (v: number) => Math.ceil(v / PX) * PX;

export type BubbleTone = 'talk' | 'shout';

/**
 * A speech bubble over someone's head. Call place() every frame with where their head is; the
 * box slides sideways to stay on screen (phones zoom in a lot) but never leaves its tail.
 */
export class SpeechBubble {
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private width = 0;
  private left = 0;

  constructor(scene: Phaser.Scene, private readonly wrap = 300) {
    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, '', textStyle(24, TEXT_COLOR, { strokeThickness: 0, align: 'center', wordWrap: { width: wrap } })).setOrigin(0.5);
    this.body = scene.add.container(0, 0, [this.bg, this.text]);
    const tail = scene.add.graphics();
    drawTail(tail, TAIL.length);
    this.root = scene.add.container(0, 0, [this.body, tail]).setDepth(DEPTH.bubbles).setVisible(false);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Shows `text` for `seconds` (a 'shout' is in red). */
  say(text: string, seconds: number, tone: BubbleTone = 'talk'): void {
    this.text.setText(text).setColor(tone === 'shout' ? SHOUT_COLOR : TEXT_COLOR);
    // An odd number of art pixels wide, so the box centres on the tail like the art grid does.
    let w = snap(Math.min(this.wrap, this.text.width) + 7 * PX);
    if ((w / PX) % 2 === 0) w += PX;
    const h = snap(this.text.height + 4 * PX);
    this.width = w;
    // The box sits on the tail: its bottom border is the tail's top row.
    const bottom = -(TAIL.length - 1) * PX;
    this.bg.clear();
    drawPixelBox(this.bg, -w / 2, bottom - h, w, h);
    this.text.setPosition(0, Math.round(bottom - h / 2 - PX / 2));
    this.root.setVisible(true);
    this.left = seconds;
  }

  hide(): void {
    this.root.setVisible(false);
    this.left = 0;
  }

  update(dt: number): void {
    if (this.left > 0 && (this.left -= dt) <= 0) this.hide();
  }

  /** Puts the tail's tip at (x, y) and keeps the box inside `view` (the camera's world view). */
  place(x: number, y: number, view?: Phaser.Geom.Rectangle): void {
    this.root.setPosition(Math.round(x), Math.round(y));
    if (!this.visible) return;
    const half = this.width / 2;
    const slack = Math.max(0, half - 4 * PX);
    const onScreen = view ? Phaser.Math.Clamp(x, view.x + half + 8, view.right - half - 8) : x;
    this.body.x = Math.round(Phaser.Math.Clamp(onScreen - x, -slack, slack) / PX) * PX;
  }

  destroy(): void {
    this.root.destroy();
  }
}

// ---- '!' and '?' emotes --------------------------------------------------------------------

export type EmoteKind = '!' | '?' | '$';

/** 7 x 8 art pixel glyphs. */
const GLYPHS: Record<EmoteKind, string[]> = {
  '!': ['..###..', '..###..', '..###..', '..###..', '...#...', '.......', '..###..', '..###..'],
  '?': ['.#####.', '##...##', '.....##', '...###.', '...##..', '.......', '...##..', '...##..'],
  $: ['...#...', '.#####.', '##.#...', '.####..', '...#.##', '#####..', '...#...', '.......'],
};

const EMOTE_COLORS: Record<EmoteKind, number> = { '!': 0xe0383c, '?': 0x3a6ad8, $: 0x2e9a48 };

/** Seconds the pop-in takes when an emote appears. */
const POP_SECONDS = 0.16;

/**
 * A Pokemon-style '!' (spotted!), '?' (huh?) or '$' bubble that pops up over someone's head.
 * Drawn once per kind/colour; place() moves it every frame.
 */
export class Emote {
  private readonly g: Phaser.GameObjects.Graphics;
  private kind: EmoteKind | null = null;
  private color = 0;
  private shownAt = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.marks).setVisible(false);
  }

  get showing(): EmoteKind | null {
    return this.kind;
  }

  /** Shows an emote (null hides it). `color` overrides the glyph colour (Mr. Gravy's orange '!'). */
  show(kind: EmoteKind | null, time: number, color?: number): void {
    const c = kind ? (color ?? EMOTE_COLORS[kind]) : 0;
    if (kind === this.kind && c === this.color) return;
    if (!this.kind && kind) this.shownAt = time;
    this.kind = kind;
    this.color = c;
    this.g.setVisible(kind !== null);
    if (!kind) return;
    const glyph = GLYPHS[kind];
    const w = (glyph[0].length + 4) * PX;
    const h = (glyph.length + 4) * PX;
    const bottom = -(TAIL.length - 1) * PX;
    this.g.clear();
    drawPixelBox(this.g, -w / 2, bottom - h, w, h);
    drawTail(this.g, TAIL.length);
    this.g.fillStyle(c, 1);
    glyph.forEach((row, r) =>
      [...row].forEach((ch, i) => {
        if (ch === '#') this.g.fillRect(-w / 2 + (i + 2) * PX, bottom - h + (r + 2) * PX, PX, PX);
      }),
    );
  }

  /** Puts the tail's tip at (x, y); it pops in when shown and then bobs one art pixel. */
  place(x: number, y: number, time: number): void {
    if (!this.kind) return;
    const t = (time - this.shownAt) / 1000 / POP_SECONDS;
    const scale = t >= 1 ? 1 : Phaser.Math.Easing.Back.Out(Math.max(0, t));
    const bob = Math.floor(time / 320) % 2 === 0 ? 0 : -PX;
    this.g.setPosition(Math.round(x), Math.round(y) + bob).setScale(scale);
  }

  destroy(): void {
    this.g.destroy();
  }
}
