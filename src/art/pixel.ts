// Pixel-art helpers. Everything is drawn on small `Pix` buffers (plain data, no browser needed,
// so the art can be unit tested) at 1 art pixel = PX screen pixels: a 16x16 tile becomes a 64x64
// texture, the size of one map tile. Then `addTexture` / `addSheet` turn buffers into Phaser
// textures at boot.
//
// Colours are numbers: 0xRRGGBB is opaque; use `alpha(0x000000, 0.4)` for see-through ones.
// `null` (or CLEAR) means transparent.

import type Phaser from 'phaser';

/** Screen pixels per art pixel. A 16px tile is one 64px map tile. */
export const PX = 4;

export type Color = number | null;
export const CLEAR: Color = null;

/** A colour with transparency, `a` from 0 (invisible) to 1 (solid). */
export function alpha(rgb: number, a: number): Color {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
  return v === 0 ? null : (((v << 24) | (rgb & 0xffffff)) >>> 0);
}

/** Packs a Color as 0xAARRGGBB (0 = transparent). */
function argb(c: Color): number {
  if (c === null) return 0;
  return c > 0xffffff ? c >>> 0 : (0xff000000 | c) >>> 0;
}

/** Mixes two RGB colours, t = 0 gives a, 1 gives b. */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Darker (amount > 0) or lighter (amount < 0) version of an RGB colour. */
export function shade(c: number, amount: number): number {
  return amount >= 0 ? mix(c, 0x000000, amount) : mix(c, 0xffffff, -amount);
}

/** Deterministic random numbers in [0, 1), so generated textures look the same every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A small image, one entry per art pixel. */
export class Pix {
  /** 0xAARRGGBB per pixel, row by row; 0 = transparent. */
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  /** The pixel as 0xAARRGGBB (0 = transparent, also outside the image). */
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  /** Draws one pixel (see-through colours blend over what is there). Outside the image: ignored. */
  set(x: number, y: number, c: Color): this {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = y * this.w + x;
    const src = argb(c);
    const a = src >>> 24;
    if (a === 255 || this.data[i] === 0) this.data[i] = src;
    else if (a > 0) {
      const dst = this.data[i];
      const t = a / 255;
      const da = dst >>> 24;
      const outA = Math.min(255, Math.round(a + da * (1 - t)));
      this.data[i] = ((outA << 24) | mix(dst & 0xffffff, src & 0xffffff, t)) >>> 0;
    }
    return this;
  }

  /** Makes one pixel transparent. */
  erase(x: number, y: number): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[Math.floor(y) * this.w + Math.floor(x)] = 0;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    return this;
  }

  /** A 1px rectangle outline. */
  box(x: number, y: number, w: number, h: number, c: Color): this {
    this.hline(x, y, w, c).hline(x, y + h - 1, w, c);
    return this.vline(x, y, h, c).vline(x + w - 1, y, h, c);
  }

  hline(x: number, y: number, w: number, c: Color): this {
    return this.rect(x, y, w, 1, c);
  }

  vline(x: number, y: number, h: number, c: Color): this {
    return this.rect(x, y, 1, h, c);
  }

  /** Filled ellipse inside the box x,y,w,h. */
  ellipse(x: number, y: number, w: number, h: number, c: Color): this {
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = (xx + 0.5 - cx) / (w / 2);
        const dy = (yy + 0.5 - cy) / (h / 2);
        if (dx * dx + dy * dy <= 1) this.set(xx, yy, c);
      }
    }
    return this;
  }

  /**
   * Draws ASCII art: one string per row, one character per pixel, looked up in `palette`.
   * Characters missing from the palette (use '.' or ' ') are left untouched.
   */
  rows(rows: readonly string[], palette: Record<string, Color>, dx = 0, dy = 0): this {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch in palette) this.set(dx + x, dy + y, palette[ch]);
      }
    });
    return this;
  }

  /** Draws another image on top of this one at dx,dy (optionally mirrored left-right). */
  draw(src: Pix, dx = 0, dy = 0, flipX = false): this {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const v = src.data[y * src.w + (flipX ? src.w - 1 - x : x)];
        if (v !== 0) this.set(dx + x, dy + y, v);
      }
    }
    return this;
  }

  /** Paints every transparent pixel that touches (edge to edge) a solid one: a 1px outline. */
  outline(c: Color): this {
    const solid = (x: number, y: number) => this.get(x, y) >>> 24 > 127;
    const marks: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== 0) continue;
        if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) marks.push(x, y);
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.set(marks[i], marks[i + 1], c);
    return this;
  }

  /** Recolours every pixel of one exact RGB colour (keeps its transparency). */
  swap(from: number, to: number): this {
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (v !== 0 && (v & 0xffffff) === (from & 0xffffff)) this.data[i] = ((v & 0xff000000) | (to & 0xffffff)) >>> 0;
    }
    return this;
  }

  clone(): Pix {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  flipX(): Pix {
    return new Pix(this.w, this.h).draw(this, 0, 0, true);
  }

  /** True when no pixel is drawn. */
  get empty(): boolean {
    return this.data.every((v) => v === 0);
  }
}

/** A Pix from ASCII art rows (see Pix.rows). Width = the longest row. */
export function fromRows(rows: readonly string[], palette: Record<string, Color>): Pix {
  return new Pix(Math.max(0, ...rows.map((r) => r.length)), rows.length).rows(rows, palette);
}

// ---------------------------------------------------------------- Phaser side (browser only)

/** Draws a Pix onto a new canvas, each art pixel as a scale x scale block. */
export function toCanvas(pix: Pix, scale = PX): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pix.w * scale;
  canvas.height = pix.h * scale;
  paintInto(canvas, pix, 0, 0, scale);
  return canvas;
}

function paintInto(canvas: HTMLCanvasElement, pix: Pix, ox: number, oy: number, scale: number) {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(pix.w * scale, pix.h * scale);
  const out = img.data;
  const rowBytes = pix.w * scale * 4;
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      const v = pix.data[y * pix.w + x];
      if (v === 0) continue;
      const r = (v >>> 16) & 255;
      const g = (v >>> 8) & 255;
      const b = v & 255;
      const a = v >>> 24;
      for (let sy = 0; sy < scale; sy++) {
        let o = (y * scale + sy) * rowBytes + x * scale * 4;
        for (let sx = 0; sx < scale; sx++, o += 4) {
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] = a;
        }
      }
    }
  }
  ctx.putImageData(img, ox, oy);
}

/** Registers a Pix as a texture (replacing any texture with that key). Pixel art stays crisp (nearest filtering). */
export function addTexture(textures: Phaser.Textures.TextureManager, key: string, pix: Pix, scale = PX): Phaser.Textures.Texture {
  if (textures.exists(key)) textures.remove(key);
  const tex = textures.addCanvas(key, toCanvas(pix, scale))!;
  tex.setFilter(0 /* Phaser.Textures.FilterMode.NEAREST */);
  return tex;
}

/**
 * Registers equal-sized frames as one texture with named frames (e.g. "down-0", "left-2"),
 * laid out in rows of `columns`. Use with `scene.add.image(x, y, key, 'down-0')` or setFrame().
 */
export function addSheet(
  textures: Phaser.Textures.TextureManager,
  key: string,
  frames: readonly { name: string; pix: Pix }[],
  scale = PX,
  columns = 12,
): Phaser.Textures.Texture {
  if (!frames.length) throw new Error(`Sheet ${key} has no frames`);
  const fw = frames[0].pix.w * scale;
  const fh = frames[0].pix.h * scale;
  const cols = Math.min(columns, frames.length);
  const canvas = document.createElement('canvas');
  canvas.width = cols * fw;
  canvas.height = Math.ceil(frames.length / cols) * fh;
  frames.forEach((f, i) => {
    if (f.pix.w * scale !== fw || f.pix.h * scale !== fh) throw new Error(`Sheet ${key}: frame ${f.name} is a different size`);
    paintInto(canvas, f.pix, (i % cols) * fw, Math.floor(i / cols) * fh, scale);
  });
  if (textures.exists(key)) textures.remove(key);
  const tex = textures.addCanvas(key, canvas)!;
  frames.forEach((f, i) => tex.add(f.name, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
  tex.setFilter(0 /* Phaser.Textures.FilterMode.NEAREST */);
  return tex;
}
