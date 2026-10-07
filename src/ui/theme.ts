import Phaser from 'phaser';
import { LIGATURE, breakLigatures, isDarkColor, shadowOffset } from './textRules';

export { breakLigatures, isDarkColor, shadowOffset };

// The UI look: a Pokemon (GBA) style. Cream windows with a dark navy rim and a light blue inner
// rim, pixel corners, dark text with a light drop shadow inside windows, and light text with a
// thin dark outline and a hard shadow when drawn straight over the game.

/** The pixel font (loaded from Google Fonts by index.html; monospace if it can't be reached). */
export const FONT_NAME = 'Pixelify Sans';
/**
 * Pixelify Sans's 5 looks just like its S ("$50" reads "$S0", "7:05" reads "7:0S"), so digits come
 * from Tiny5, a pixel font of the same height and weight. index.html loads only its digits 0-9,
 * so every other character falls through to Pixelify Sans.
 */
export const DIGITS_FONT_NAME = 'Tiny5';
export const FONT = `"${DIGITS_FONT_NAME}", "${FONT_NAME}", monospace`;
/** Weights texts use (bold for titles). */
const FONT_WEIGHTS = ['400', '700'];
/** Never hold up the start for longer than this (offline, slow networks). */
export const FONT_TIMEOUT_MS = 3000;

/**
 * Waits (briefly) for the pixel fonts, so the first texts aren't drawn in the fallback font.
 * index.html loads the fonts' stylesheets without blocking the page (media="print"); this switches
 * them on once they arrive. Gives up after FONT_TIMEOUT_MS so offline play still starts.
 */
export async function loadFonts(timeoutMs = FONT_TIMEOUT_MS): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[data-pixel-font]')];
  // Offline: the stylesheets have already failed, there is nothing to wait for.
  if (links.some((l) => !l.sheet) && typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const sheetLoaded = (link: HTMLLinkElement) =>
    link.sheet
      ? Promise.resolve()
      : new Promise<void>((done) => {
          link.addEventListener('load', () => done(), { once: true });
          link.addEventListener('error', () => done(), { once: true });
        });
  const ready = (async () => {
    await Promise.all(links.map(sheetLoaded));
    for (const link of links) link.media = 'all';
    await Promise.all([
      ...FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 32px "${FONT_NAME}"`)),
      document.fonts.load(`32px "${DIGITS_FONT_NAME}"`, '0123456789'),
    ]);
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([ready, new Promise<void>((done) => (timer = setTimeout(done, timeoutMs)))]);
  clearTimeout(timer);
}

// Pixelify Sans draws its "fi" / "fl" ligatures like an "A". Canvas text can't switch ligatures
// off in every browser, so every Text draws its string through breakLigatures(); the text itself
// (Text.text) is untouched.
type TextInternals = { updateText(): unknown; _text: string };
const textProto = Phaser.GameObjects.Text.prototype as unknown as TextInternals & { __noLigatures?: boolean };
if (!textProto.__noLigatures) {
  textProto.__noLigatures = true;
  const updateText = textProto.updateText;
  textProto.updateText = function (this: TextInternals) {
    const raw = this._text;
    if (typeof raw !== 'string' || !LIGATURE.test(raw)) return updateText.call(this);
    this._text = breakLigatures(raw);
    try {
      return updateText.call(this);
    } finally {
      this._text = raw;
    }
  };
}

export const COLORS = {
  // Light text for drawing straight over the game (outlined), and the game's accent colours.
  copper: '#f4a25a',
  copperDark: 0xb85f22,
  text: '#f8f8f0',
  muted: '#b8c4d8',
  good: '#80e078',
  bad: '#ff6450',
  warn: '#ffd448',
  /** Dark panels (toasts, the touch buttons). */
  panel: 0x283050,
  /** Outlines and shadows of light text. */
  ink: '#1c2238',
  // Windows: cream inside, dark navy rim, light blue inner rim.
  box: 0xf8f4e8,
  boxShade: 0xe6dfcb,
  boxEdge: 0x283050,
  boxRim: 0x98c0e8,
  /** Dark text inside windows, with its light drop shadow. */
  boxText: '#3a3e4c',
  boxTextShadow: '#d4cfc0',
  boxMuted: '#6a7290',
  boxGood: '#2f9a3c',
  boxBad: '#d23a2a',
  boxCopper: '#c0602a',
  /** The "selected" accent (primary buttons, the chosen crew card). */
  accent: 0xf09040,
  accentFill: 0xfde2b4,
  alert: 0xe03a2c,
};

/** Button looks: spread into Button options. */
export const BUTTON_PRIMARY = { fill: COLORS.accentFill, rim: COLORS.accent };
export const BUTTON_SECONDARY = { fill: COLORS.box, rim: COLORS.boxRim };

/**
 * Text in the pixel font. Light colours get a thin dark outline and a hard drop shadow (readable
 * over the game); dark colours (text inside windows) get no outline and a soft light shadow, like
 * the text boxes in the GBA games.
 */
export function textStyle(
  size: number,
  color: string = COLORS.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const px = Math.max(1, Math.round(size));
  const dark = isDarkColor(color);
  const off = shadowOffset(px);
  return {
    fontFamily: FONT,
    fontSize: `${px}px`,
    color,
    stroke: COLORS.ink,
    strokeThickness: dark ? 0 : Math.max(2, Math.round(px / 12)),
    shadow: { offsetX: off, offsetY: off, color: dark ? COLORS.boxTextShadow : COLORS.ink, blur: 0, stroke: true, fill: true },
    ...extra,
  };
}

/** Changes a text's size, keeping its outline and shadow in proportion. Only re-renders on a change. */
export function setTextSize(text: Phaser.GameObjects.Text, size: number): Phaser.GameObjects.Text {
  const px = Math.max(1, Math.round(size));
  if (text.style.fontSize === `${px}px`) return text;
  text.setFontSize(px);
  if (text.style.strokeThickness > 0) text.setStroke(text.style.stroke, Math.max(2, Math.round(px / 12)));
  const off = shadowOffset(px);
  return text.setShadowOffset(off, off);
}

/** Shrinks a text (keeping its style in proportion) until it is at most `maxWidth` wide. */
export function fitWidth(text: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
  const size = parseFloat(String(text.style.fontSize));
  if (text.width > maxWidth && size > 0) setTextSize(text, Math.max(8, Math.floor((size * maxWidth) / text.width)));
  return text;
}

/** Text.setColor re-renders and re-uploads the text every call, so only call it on a change. */
export function setTextColor(text: Phaser.GameObjects.Text, color: string): Phaser.GameObjects.Text {
  if (text.style.color !== color) text.setColor(color);
  return text;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ---------------------------------------------------------------- windows

export interface BoxStyle {
  /** Inside colour. */
  fill?: number;
  /** Outer rim (dark). */
  edge?: number;
  /** Inner rim (light). Null for a single rim. */
  rim?: number | null;
  /** Size of one "pixel" of the frame, in screen pixels. */
  unit?: number;
  alpha?: number;
}

/** A rectangle with stepped pixel corners (`steps` pixels cut off each corner). */
export function pixelRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  unit: number,
  steps: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Graphics {
  g.fillStyle(color, alpha);
  const s = Math.max(0, Math.min(steps, Math.floor(w / unit / 2), Math.floor(h / unit / 2)));
  for (let i = 0; i < s; i++) {
    const inset = (s - i) * unit;
    g.fillRect(x + inset, y + i * unit, w - 2 * inset, unit);
    g.fillRect(x + inset, y + h - (i + 1) * unit, w - 2 * inset, unit);
  }
  g.fillRect(x, y + s * unit, w, h - 2 * s * unit);
  return g;
}

/** A window in the UI style: dark rim, light inner rim, cream inside, pixel corners. */
export function drawBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, style: BoxStyle = {}): Phaser.GameObjects.Graphics {
  const u = Math.max(1, Math.round(style.unit ?? 4));
  const a = style.alpha ?? 1;
  const rim = style.rim === undefined ? COLORS.boxRim : style.rim;
  pixelRect(g, x, y, w, h, u, 2, style.edge ?? COLORS.boxEdge, a);
  if (rim !== null) {
    pixelRect(g, x + u, y + u, w - 2 * u, h - 2 * u, u, 1, rim, a);
    pixelRect(g, x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u, u, 1, style.edge ?? COLORS.boxEdge, a);
    pixelRect(g, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, u, 0, style.fill ?? COLORS.box, a);
  } else {
    pixelRect(g, x + u, y + u, w - 2 * u, h - 2 * u, u, 1, style.fill ?? COLORS.box, a);
  }
  return g;
}

/** How thick a window's frame is (to keep contents inside it). */
export const boxBorder = (unit: number, rim = true) => (rim ? 3 : 1) * Math.max(1, Math.round(unit));

/** The ▶ cursor of menus, pointing right with its tip at (x, y). `size` = height in screen pixels. */
export function drawCursor(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number = COLORS.boxEdge): Phaser.GameObjects.Graphics {
  const rows = 7;
  const u = Math.max(1, Math.round(size / rows));
  const left = x - Math.ceil(rows / 2) * u;
  g.fillStyle(color, 1);
  for (let i = 0; i < rows; i++) g.fillRect(left, y - (rows * u) / 2 + i * u, Math.min(i + 1, rows - i) * u, u);
  return g;
}

/** The ▼ "more" arrow of text boxes, tip at the bottom centre (x, y). */
export function drawMoreArrow(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number = COLORS.alert): Phaser.GameObjects.Graphics {
  const rows = 4;
  const u = Math.max(1, Math.round(size / rows));
  g.fillStyle(color, 1);
  for (let i = 0; i < rows; i++) {
    const w = (rows - i) * 2 - 1;
    g.fillRect(x - (w * u) / 2, y - (rows - i) * u, w * u, u);
  }
  return g;
}

// ---------------------------------------------------------------- buttons

export interface ButtonOptions {
  width?: number;
  height?: number;
  /** Inside colour of the window. */
  fill?: number;
  /** Inner rim colour (BUTTON_PRIMARY / BUTTON_SECONDARY set both). */
  rim?: number;
  fontSize?: number;
  textColor?: string;
}

/** A menu option in a window, with a ▶ cursor while hovered or selected. Works with mouse and touch. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private readonly bw: number;
  private readonly bh: number;
  private fill: number;
  private rim: number;
  private hover = false;
  private selected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    this.bw = opts.width ?? 360;
    this.bh = opts.height ?? 96;
    this.fill = opts.fill ?? BUTTON_PRIMARY.fill;
    this.rim = opts.rim ?? (opts.fill === undefined ? BUTTON_PRIMARY.rim : COLORS.boxRim);
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, textStyle(opts.fontSize ?? 40, opts.textColor ?? COLORS.boxText)).setOrigin(0.5, 0.55);
    const hit = scene.add.zone(0, 0, this.bw, this.bh).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.label, hit]);
    this.draw();
    hit.on('pointerover', () => {
      this.hover = true;
      this.draw();
    });
    hit.on('pointerout', () => {
      this.hover = false;
      this.draw();
      this.setScale(1);
    });
    hit.on('pointerdown', () => this.setScale(0.96));
    hit.on('pointerup', () => {
      this.setScale(1);
      onClick();
    });
    scene.add.existing(this);
  }

  setFill(fill: number): this {
    this.fill = fill;
    this.draw();
    return this;
  }

  /** Shows the ▶ cursor (the option Enter would pick). */
  setSelected(on: boolean): this {
    if (this.selected !== on) {
      this.selected = on;
      this.draw();
    }
    return this;
  }

  private draw() {
    const { bw: w, bh: h } = this;
    const u = Math.max(3, Math.round(h / 22));
    const g = this.bg.clear();
    // A hard shadow under the window, like a raised key.
    pixelRect(g, -w / 2 + u, -h / 2 + u * 1.5, w, h, u, 2, COLORS.boxEdge, 0.35);
    const fill = this.hover ? Phaser.Display.Color.ValueToColor(this.fill).lighten(4).color : this.fill;
    drawBox(g, -w / 2, -h / 2, w, h, { unit: u, fill, rim: this.rim });
    if (this.hover || this.selected) {
      const size = Math.min(h * 0.42, 44);
      const tip = -this.label.width / 2 - size * 0.45;
      drawCursor(g, Math.max(tip, -w / 2 + size + 4 * u), 0, size);
    }
  }
}

// ---------------------------------------------------------------- screens

/** How many CSS pixels one game pixel covers on this screen (small on phones, ~1 on desktops). */
export function cssPerGamePixel(scale: Phaser.Scale.ScaleManager): number {
  return scale.displaySize.width / Math.max(1, scale.gameSize.width);
}

export function isPortrait(scale: Phaser.Scale.ScaleManager): boolean {
  return scale.height > scale.width;
}

/**
 * For menu-style screens in portrait: zooms the camera so a fixed-width column of
 * `columnWidth` x `minHeight` virtual pixels fits, and returns the virtual screen size.
 */
export function fitColumn(scene: Phaser.Scene, columnWidth: number, minHeight: number): { width: number; height: number } {
  const { width: W, height: H } = scene.scale;
  const zoom = Math.min(W / columnWidth, H / minHeight);
  const width = W / zoom;
  const height = H / zoom;
  const cam = scene.cameras.main;
  cam.setZoom(zoom);
  cam.centerOn(width / 2, height / 2);
  return { width, height };
}

export function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !window.matchMedia('(pointer: fine)').matches);
  } catch {
    return false;
  }
}
