import Phaser from 'phaser';
import { PX } from '../art/pixel';
import type { Box } from '../systems/bubbleLayout';
import type { Side } from '../systems/edgeMarkers';
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

/** A box with a 1 art pixel border and stepped corners, `w` x `h` px (multiples of the art pixel `P`). */
export function drawPixelBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, P = PX): void {
  g.fillStyle(INK, 1)
    .fillRect(x + 2 * P, y, w - 4 * P, h)
    .fillRect(x + P, y + P, w - 2 * P, h - 2 * P)
    .fillRect(x, y + 2 * P, w, h - 4 * P);
  g.fillStyle(PAPER, 1)
    .fillRect(x + 2 * P, y + P, w - 4 * P, h - 2 * P)
    .fillRect(x + P, y + 2 * P, w - 2 * P, h - 4 * P);
  g.fillStyle(PAPER_SHADE, 1).fillRect(x + 2 * P, y + h - 2 * P, w - 4 * P, P);
}

/**
 * The little tail under a box, its tip at (0, 0). Its first row is the joint: drawn over the box's
 * bottom border so the two join.
 */
const TAIL = ['KWWWK', '.KWK.', '..K..'];
/** A raised box (see SpeechBubble.lift) gets a longer tail: this row repeated. */
const STEM = '.KWK.';
/** Where a box's bottom edge sits above the tail's tip. */
const BOX_BOTTOM = -(TAIL.length - 1) * PX;

/** Draws rows of tail art, centred on x = 0, the last row ending at y = `bottom`. */
function drawRows(g: Phaser.GameObjects.Graphics, rows: readonly string[], bottom = 0) {
  rows.forEach((row, r) => {
    [...row].forEach((c, i) => {
      if (c === '.') return;
      g.fillStyle(c === 'K' ? INK : PAPER, 1).fillRect((i - 2) * PX - PX / 2, bottom + (r - rows.length) * PX, PX, PX);
    });
  });
}

const snap = (v: number) => Math.ceil(v / PX) * PX;

export type BubbleTone = 'talk' | 'shout';

/** Counts lines said, so the newest can be told apart. */
let linesSaid = 0;

/**
 * A speech bubble over someone's head. Call place() every frame with where their head is; the
 * box slides sideways to stay on screen (phones zoom in a lot) but never leaves its tail. When
 * people bunch up, GameScene moves bubbles up out of each other's way (lift) or hides one for a
 * moment (cover): see systems/bubbleLayout.ts.
 */
export class SpeechBubble {
  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  /** The tail's joint, over the box's bottom border, and the rest of it (stem and tip). */
  private readonly joint: Phaser.GameObjects.Graphics;
  private readonly tail: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private width = 0;
  private height = 0;
  private left = 0;
  private saying = false;
  private covered = false;
  /** Out of Dalton's sight in the fog of war: not shown, and out of other bubbles' way. */
  private hidden = false;
  /** Art pixels the box is raised above its usual place. */
  private stem = 0;
  /** How much bigger than normal it's drawn (phones zoomed out: see GameScene.overheadScale). */
  private size = 1;
  private tone: BubbleTone = 'talk';
  private said = 0;

  constructor(scene: Phaser.Scene, private readonly wrap = 300) {
    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, '', textStyle(24, TEXT_COLOR, { strokeThickness: 0, align: 'center', wordWrap: { width: wrap } })).setOrigin(0.5);
    this.body = scene.add.container(0, 0, [this.bg, this.text]);
    this.joint = scene.add.graphics();
    drawRows(this.joint, TAIL.slice(0, 1), BOX_BOTTOM);
    this.root = scene.add.container(0, 0, [this.body, this.joint]).setDepth(DEPTH.bubbles).setVisible(false);
    // The rest of the tail goes under every bubble's box: a long one (a raised box) passes behind the others.
    this.tail = scene.add.graphics().setDepth(DEPTH.bubbles - 0.5).setVisible(false);
    drawRows(this.tail, TAIL.slice(1));
  }

  /** Saying something (even while another bubble covers it for a moment). */
  get visible(): boolean {
    return this.saying;
  }

  /** Who goes first when bubbles are in each other's way: shouts, then the newest line. */
  get rank(): number {
    return (this.tone === 'shout' ? 1e9 : 0) + this.said;
  }

  /** Where the box is (world px) in its usual place, or null when there's nothing to say. */
  get bounds(): Box | null {
    if (!this.saying || this.hidden) return null;
    const k = this.size;
    return {
      x: this.root.x + (this.body.x - this.width / 2) * k,
      y: this.root.y + (BOX_BOTTOM - this.height) * k,
      w: this.width * k,
      h: this.height * k,
    };
  }

  /** Shows `text` for `seconds` (a 'shout' is in red). */
  say(text: string, seconds: number, tone: BubbleTone = 'talk'): void {
    this.text.setText(text).setColor(tone === 'shout' ? SHOUT_COLOR : TEXT_COLOR);
    // An odd number of art pixels wide, so the box centres on the tail like the art grid does.
    let w = snap(Math.min(this.wrap, this.text.width) + 7 * PX);
    if ((w / PX) % 2 === 0) w += PX;
    const h = snap(this.text.height + 4 * PX);
    this.width = w;
    this.height = h;
    // The box sits on the tail: its bottom border is the tail's top row.
    this.bg.clear();
    drawPixelBox(this.bg, -w / 2, BOX_BOTTOM - h, w, h);
    this.text.setPosition(0, Math.round(BOX_BOTTOM - h / 2 - PX / 2));
    this.tone = tone;
    this.said = ++linesSaid;
    this.saying = true;
    this.left = seconds;
    this.refresh();
  }

  hide(): void {
    this.saying = false;
    this.left = 0;
    this.refresh();
  }

  /** Hides it while the speaker is out of Dalton's sight (it keeps talking, unseen). */
  setHidden(on: boolean): void {
    if (on === this.hidden) return;
    this.hidden = on;
    this.refresh();
  }

  update(dt: number): void {
    if (this.left > 0 && (this.left -= dt) <= 0) this.hide();
  }

  /**
   * Puts the tail's tip at (x, y) and keeps the box inside `view` (the camera's world view).
   * `size` draws it bigger (phones zoomed out).
   */
  place(x: number, y: number, view?: Phaser.Geom.Rectangle, size = 1): void {
    this.size = size;
    this.root.setPosition(Math.round(x), Math.round(y)).setScale(size);
    this.tail.setPosition(this.root.x, this.root.y).setScale(size);
    if (!this.saying) return;
    const half = this.width / 2;
    const slack = Math.max(0, half - 4 * PX);
    const onScreen = view ? Phaser.Math.Clamp(x, view.x + half * size + 8, view.right - half * size - 8) : x;
    this.body.x = Math.round(Phaser.Math.Clamp((onScreen - x) / size, -slack, slack) / PX) * PX;
  }

  /**
   * Raises the box `px` (world px) above its usual place, its tail stretching down to the speaker,
   * or hides it for now (null) when there's no room. Call after place(), every frame.
   */
  lift(px: number | null): void {
    this.covered = px === null;
    const stem = px === null ? 0 : Math.ceil(px / this.size / PX);
    if (stem !== this.stem) {
      this.stem = stem;
      this.body.y = this.joint.y = -stem * PX;
      drawRows(this.tail.clear(), [...Array<string>(stem).fill(STEM), ...TAIL.slice(1)]);
    }
    this.refresh();
  }

  destroy(): void {
    this.root.destroy();
    this.tail.destroy();
  }

  private refresh() {
    const on = this.saying && !this.covered && !this.hidden;
    this.root.setVisible(on);
    this.tail.setVisible(on);
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

/**
 * The HUD's edge marker for someone onto Dalton out of sight: a '!' or '?' box (art pixel `u` px)
 * centred on (x, y), with an arrow out of its `side` pointing their way.
 */
export function drawEdgeMarker(g: Phaser.GameObjects.Graphics, kind: EmoteKind, x: number, y: number, u: number, side: Side, color?: number): void {
  const glyph = GLYPHS[kind];
  const w = (glyph[0].length + 4) * u;
  const h = (glyph.length + 4) * u;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  drawPixelBox(g, left, top, w, h, u);
  g.fillStyle(color ?? EMOTE_COLORS[kind], 1);
  glyph.forEach((row, r) =>
    [...row].forEach((ch, i) => {
      if (ch === '#') g.fillRect(left + (i + 2) * u, top + (r + 2) * u, u, u);
    }),
  );
  // The arrow is the speech tail turned to face `side`, its first row on the box's border.
  const cx = left + w / 2;
  const cy = top + Math.floor(h / u / 2) * u;
  TAIL.forEach((row, r) =>
    [...row].forEach((c, i) => {
      if (c === '.') return;
      const out = r * u;
      const spot: Record<Side, [number, number]> = {
        bottom: [cx + (i - 2.5) * u, top + h - u + out],
        top: [cx + (i - 2.5) * u, top - out],
        right: [left + w - u + out, cy + (i - 2) * u],
        left: [left - out, cy + (i - 2) * u],
      };
      g.fillStyle(c === 'K' ? INK : PAPER, 1).fillRect(spot[side][0], spot[side][1], u, u);
    }),
  );
}

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
  private size = 1;
  /** Hidden for now under someone's speech bubble (see systems/bubbleLayout.ts). */
  private covered = false;
  /** Out of Dalton's sight in the fog of war. */
  private hidden = false;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.marks).setVisible(false);
  }

  get showing(): EmoteKind | null {
    return this.kind;
  }

  /** Where it is (world px), or null when there's none. */
  get bounds(): Box | null {
    if (!this.kind || this.hidden) return null;
    const glyph = GLYPHS[this.kind];
    const w = (glyph[0].length + 4) * PX * this.size;
    const h = (glyph.length + 4 + TAIL.length - 1) * PX * this.size;
    return { x: this.g.x - w / 2, y: this.g.y - h, w, h };
  }

  /** Hides it while a speech bubble covers it. */
  cover(on: boolean): void {
    this.covered = on;
    this.g.setVisible(this.kind !== null && !on && !this.hidden);
  }

  /** Hides it while its owner is out of Dalton's sight. */
  setHidden(on: boolean): void {
    this.hidden = on;
    this.g.setVisible(this.kind !== null && !this.covered && !on);
  }

  /** Shows an emote (null hides it). `color` overrides the glyph colour (Mr. Gravy's orange '!'). */
  show(kind: EmoteKind | null, time: number, color?: number): void {
    const c = kind ? (color ?? EMOTE_COLORS[kind]) : 0;
    if (kind === this.kind && c === this.color) return;
    if (!this.kind && kind) this.shownAt = time;
    this.kind = kind;
    this.color = c;
    this.g.setVisible(kind !== null && !this.covered && !this.hidden);
    if (!kind) return;
    const glyph = GLYPHS[kind];
    const w = (glyph[0].length + 4) * PX;
    const h = (glyph.length + 4) * PX;
    const bottom = BOX_BOTTOM;
    this.g.clear();
    drawPixelBox(this.g, -w / 2, bottom - h, w, h);
    drawRows(this.g, TAIL);
    this.g.fillStyle(c, 1);
    glyph.forEach((row, r) =>
      [...row].forEach((ch, i) => {
        if (ch === '#') this.g.fillRect(-w / 2 + (i + 2) * PX, bottom - h + (r + 2) * PX, PX, PX);
      }),
    );
  }

  /**
   * Puts the tail's tip at (x, y); it pops in when shown and then bobs one art pixel. `size` draws
   * it bigger (phones zoomed out).
   */
  place(x: number, y: number, time: number, size = 1): void {
    this.size = size;
    if (!this.kind) return;
    const t = (time - this.shownAt) / 1000 / POP_SECONDS;
    const pop = t >= 1 ? 1 : Phaser.Math.Easing.Back.Out(Math.max(0, t));
    const bob = Math.floor(time / 320) % 2 === 0 ? 0 : -PX * size;
    this.g.setPosition(Math.round(x), Math.round(y + bob)).setScale(pop * size);
  }

  destroy(): void {
    this.g.destroy();
  }
}
