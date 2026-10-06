import Phaser from 'phaser';

export const FONT = '"Arial Black", "Arial Bold", Gadget, "Helvetica Neue", Arial, sans-serif';

export const COLORS = {
  copper: '#e8914a',
  copperDark: 0xb85f22,
  text: '#f6f1e5',
  muted: '#aab2bf',
  good: '#7ddc7d',
  bad: '#ff5a4f',
  warn: '#ffc23d',
  panel: 0x12151c,
  ink: '#14161c',
};

export function textStyle(
  size: number,
  color: string = COLORS.text,
  extra: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    color,
    stroke: COLORS.ink,
    strokeThickness: Math.max(3, Math.round(size / 7)),
    ...extra,
  };
}

/** Text.setColor re-renders and re-uploads the text every call, so only call it on a change. */
export function setTextColor(text: Phaser.GameObjects.Text, color: string): Phaser.GameObjects.Text {
  if (text.style.color !== color) text.setColor(color);
  return text;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export interface ButtonOptions {
  width?: number;
  height?: number;
  fill?: number;
  fontSize?: number;
  textColor?: string;
}

/** A chunky rounded button that works with mouse and touch. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private readonly bw: number;
  private readonly bh: number;
  private fill: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    this.bw = opts.width ?? 360;
    this.bh = opts.height ?? 96;
    this.fill = opts.fill ?? 0xd9772f;
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, textStyle(opts.fontSize ?? 40, opts.textColor)).setOrigin(0.5);
    const hit = scene.add.zone(0, 0, this.bw, this.bh).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.label, hit]);
    this.draw(false);
    hit.on('pointerover', () => this.draw(true));
    hit.on('pointerout', () => {
      this.draw(false);
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
    this.draw(false);
    return this;
  }

  private draw(hover: boolean) {
    const { bw: w, bh: h } = this;
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 18);
    this.bg.fillStyle(hover ? Phaser.Display.Color.ValueToColor(this.fill).lighten(12).color : this.fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.bg.lineStyle(4, 0x14161c, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.bg.fillStyle(0xffffff, 0.18).fillRoundedRect(-w / 2 + 8, -h / 2 + 6, w - 16, h * 0.32, 12);
  }
}

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
