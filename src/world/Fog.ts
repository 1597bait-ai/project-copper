import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import {
  distanceFalloff,
  edgeFalloff,
  exploreFrom,
  footprintSpots,
  memoryMatrix,
  seesAllAround,
  seesSpot,
  shadowTriangles,
  viewRays,
  viewReach,
  type ViewShape,
} from '../systems/fog';
import type { Point } from '../systems/pathfinding';
import { angleDiff } from '../systems/vision';
import { DEPTH } from '../ui/depth';
import type { World } from './World';

// The fog of war over the school (the rules are in src/systems/fog.ts).
//
// Dalton's memory of the place is a light-gray picture of the whole map: the floors, walls and
// doors from the start, and each fixture, decoration and the van once he has seen it (redrawn when
// one of them changes, say stripped). Every frame a texture covering the screen is filled with
// that memory and a haze over the tiles he has never seen, then what he sees right now is cut out
// of it: his view, minus what the walls hide, and whatever and whoever he can see standing in it
// (whole, even the top of something that pokes up over the wall behind it). People are never in
// the memory, and out of his sight they're hidden altogether, with what they say. The fog lies
// over the world, under the speech bubbles and marks of the people he can see.

/** Someone who can only be seen in Dalton's sight: Mr. Gravy, a student, the sleepy coworker. */
export interface Watched extends Point {
  readonly view: { readonly container: Phaser.GameObjects.Container };
  /** Shows or hides them, and their vision cone (if they have one) with `cone`. */
  setSeen(seen: boolean, cone: boolean): void;
}

/** Textures: the view all around (the near ring too) and a narrower view's cone, and the memory and haze. */
const DISC_KEY = 'fog-disc';
const CONE_KEY = 'fog-cone';
const RAW_KEY = 'fog-raw';
const MEMORY_KEY = 'fog-memory';
const HAZE_KEY = 'fog-haze';
/** The view textures measure this many px from the middle to the rim. */
const VIEW_TEX = 128;
/** The fog is drawn at a quarter of the world's resolution: a texel per art pixel, kept crisp. */
const SCALE = 0.25;
/** The fog reaches this far past the screen's edges, so it still covers them while the camera catches up. */
const MARGIN = TILE * 2;
/** Sight goes this far into a wall, so a wall is seen whole from either side (but never what's behind it). */
const WALL_DEPTH = TILE * 1.25;
/** People are looked for at their middle and this far out from it each way. */
const BODY = TILE * 0.25;
/** The haze over places never seen: a pale mist. */
const HAZE_COLOR = 'rgb(240, 244, 250)';
/** The memory is redrawn at most this often (ms) while things in it keep changing. */
const REDRAW_MS = 150;

/** A texture of the view: white, its alpha how clearly each spot is seen, `u` the distance from the middle over VIEW_TEX. */
function viewTexture(textures: Phaser.Textures.TextureManager, key: string, level: (u: number, angle: number) => number): void {
  if (textures.exists(key)) textures.remove(key);
  const size = VIEW_TEX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - VIEW_TEX;
      const dy = y + 0.5 - VIEW_TEX;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * level(Math.hypot(dx, dy) / VIEW_TEX, Math.atan2(dy, dx)));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = textures.create(key, canvas, size, size)!;
  tex.add('__BASE', 0, 0, 0, size, size);
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** How far and wide Dalton sees, in world px (BALANCE.fog, read every shift). */
export function viewShape(): ViewShape {
  const f = BALANCE.fog;
  return { reach: f.viewTiles * TILE, halfAngle: Phaser.Math.DegToRad(f.viewAngleDeg / 2), near: f.nearTiles * TILE };
}

/** How an image looked when last drawn into the memory. */
interface Look {
  frame: Phaser.Textures.Frame;
  alpha: number;
  tint: number;
  scale: number;
}
const lookOf = (image: Phaser.GameObjects.Image): Look => ({ frame: image.frame, alpha: image.alpha, tint: image.tintTopLeft, scale: image.scaleX });
const looksLike = (image: Phaser.GameObjects.Image, look: Look) =>
  image.frame === look.frame && image.alpha === look.alpha && image.tintTopLeft === look.tint && image.scaleX === look.scale;

/** A fixture, decoration or the van: where to look for it, and whether (and how) Dalton has seen it. */
interface Known {
  image: Phaser.GameObjects.Image;
  rect: Phaser.Geom.Rectangle;
  spots: Point[];
  look: Look | null;
}

export class Fog {
  /** The fog shown over the world, redrawn every frame. */
  readonly layer: Phaser.GameObjects.RenderTexture;
  /** What Dalton sees right now, the walls' shadows cut out (cut out of the fog, never shown itself). */
  private readonly view: Phaser.GameObjects.RenderTexture;
  /** The map as he remembers it, in colour, then in light gray (never shown themselves). */
  private readonly raw: Phaser.Textures.DynamicTexture;
  private readonly memory: Phaser.Textures.DynamicTexture;
  private readonly haze: Phaser.Textures.CanvasTexture;
  // What's drawn into those (through their cameras, in world px; none of it is shown itself).
  private readonly rawImage: Phaser.GameObjects.Image;
  private readonly memoryImage: Phaser.GameObjects.Image;
  private readonly hazeImage: Phaser.GameObjects.Image;
  /** The view all around (or a narrower view's cone and the ring all around it). */
  private readonly ahead: Phaser.GameObjects.Image;
  private readonly near: Phaser.GameObjects.Image | null;
  private readonly shadows: Phaser.GameObjects.Graphics;
  readonly shape: ViewShape;
  /** One byte per map tile, row by row: 1 once Dalton has seen it. */
  readonly explored: Uint8Array;
  private readonly things: Known[];
  private readonly doorLooks: Look[];
  /** Where he looks from and the way he faces (radians; a narrower view swings round to it). */
  private eye: Point = { x: 0, y: 0 };
  aim: number;
  /** Things in view as last worked out, and from where (they only change when he moves, turns or a door opens). */
  private inView: Phaser.GameObjects.Image[] = [];
  private lastLook = { x: NaN, y: NaN, aim: NaN, doors: -1 };
  private dirty = true;
  private drawnAt = -Infinity;
  private size = { w: 0, h: 0 };
  private lastTime = -1;

  /**
   * The fog of war for a shift, or null when it's off or can't be drawn (the Canvas renderer, on
   * the rare browser without WebGL: Dalton sees the whole school there).
   */
  static create(scene: Phaser.Scene, world: World, player: { facing: number }): Fog | null {
    if (BALANCE.fog.mode !== 'on' || scene.game.renderer.type !== Phaser.WEBGL) return null;
    return new Fog(scene, world, player.facing);
  }

  private constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    aim: number,
  ) {
    const f = BALANCE.fog;
    this.shape = viewShape();
    this.aim = aim;
    const textures = scene.textures;
    for (const key of [RAW_KEY, MEMORY_KEY, HAZE_KEY]) if (textures.exists(key)) textures.remove(key);

    if (!textures.exists(DISC_KEY)) viewTexture(textures, DISC_KEY, (u) => distanceFalloff(u));
    const all = seesAllAround(this.shape);
    if (!all) {
      const half = this.shape.halfAngle;
      viewTexture(textures, CONE_KEY, (u, angle) => (half > 0 ? distanceFalloff(u) * edgeFalloff(Math.abs(angle) / half) : 0));
    }
    this.ahead = new Phaser.GameObjects.Image(scene, 0, 0, all ? DISC_KEY : CONE_KEY).setScale(this.shape.reach / VIEW_TEX);
    this.near = all || this.shape.near <= 0 ? null : new Phaser.GameObjects.Image(scene, 0, 0, DISC_KEY).setScale(this.shape.near / VIEW_TEX);

    // The memory covers the whole map, a texel per art pixel.
    const w = world.width * SCALE;
    const h = world.height * SCALE;
    this.raw = textures.addDynamicTexture(RAW_KEY, w, h)!;
    this.memory = textures.addDynamicTexture(MEMORY_KEY, w, h)!;
    for (const dt of [this.raw, this.memory]) {
      // (Centred, not from a top-left origin: tile layers only draw the tiles in a camera's view, worked out from its middle.)
      dt.camera.setZoom(SCALE).centerOn(world.width / 2, world.height / 2);
      dt.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.rawImage = new Phaser.GameObjects.Image(scene, 0, 0, RAW_KEY).setOrigin(0, 0).setScale(1 / SCALE);
    this.rawImage.enableFilters();
    this.rawImage.filters!.internal.addColorMatrix().colorMatrix.set(memoryMatrix(f.gray, f.light));
    this.memoryImage = new Phaser.GameObjects.Image(scene, 0, 0, MEMORY_KEY).setOrigin(0, 0).setScale(1 / SCALE);

    // The haze: a pixel per tile, smoothed when stretched, cleared tile by tile as he explores.
    const cols = world.map.width;
    const rows = world.map.height;
    this.explored = new Uint8Array(cols * rows);
    this.haze = textures.createCanvas(HAZE_KEY, cols, rows)!;
    this.haze.context.fillStyle = HAZE_COLOR;
    this.haze.context.globalAlpha = Phaser.Math.Clamp(f.unexploredHaze, 0, 1);
    this.haze.context.fillRect(0, 0, cols, rows);
    this.haze.refresh();
    this.haze.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.hazeImage = new Phaser.GameObjects.Image(scene, 0, 0, HAZE_KEY).setOrigin(0, 0).setScale(TILE);

    this.layer = scene.add.renderTexture(0, 0, 2, 2).setOrigin(0, 0).setDepth(DEPTH.fog);
    this.view = new Phaser.GameObjects.RenderTexture(scene, 0, 0, 2, 2).setOrigin(0, 0);
    for (const rt of [this.layer, this.view]) {
      rt.setScale(1 / SCALE);
      rt.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.shadows = scene.make.graphics({}, false);

    this.things = world.things.map((t) => ({ ...t, spots: footprintSpots(t.rect, TILE), look: null }));
    this.doorLooks = world.doors.map((d) => lookOf(d.sprite));
  }

  /** Whether Dalton sees world spot `p` right now (as of the last update). */
  sees(p: Point): boolean {
    return seesSpot(this.world.sight, this.eye, this.aim, this.shape, WALL_DEPTH, p);
  }

  /** Whether he has seen this fixture, decoration or van (it's in his memory of the place). */
  knows(image: Phaser.GameObjects.Image): boolean {
    return this.things.some((t) => t.image === image && t.look !== null);
  }

  /** Works out what Dalton sees and redraws the fog for this frame. `time` in ms (scene time). */
  update(player: Point & { facing: number; view: { readonly container: Phaser.GameObjects.Container } }, people: readonly Watched[], time: number): void {
    const f = BALANCE.fog;
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    // A narrower view swings round to where he faces: 95% of the way in turnSeconds.
    const k = f.turnSeconds > 0 ? 1 - Math.exp((-3 * dt) / f.turnSeconds) : 1;
    this.aim = Phaser.Math.Angle.Wrap(this.aim + angleDiff(this.aim, player.facing) * k);
    this.eye = { x: player.x, y: player.y };

    this.look();
    this.remember(time);

    // People: seen whole, or not at all.
    const seen: Phaser.GameObjects.Container[] = [];
    for (const who of people) {
      const sees = f.people === 'shown' || [[0, 0], [BODY, 0], [-BODY, 0], [0, BODY], [0, -BODY]].some(([dx, dy]) => this.sees({ x: who.x + dx, y: who.y + dy }));
      who.setSeen(sees, sees || f.people === 'cones');
      if (sees) seen.push(who.view.container);
    }

    this.fit();

    // What he sees: his view, the walls' shadows cut out of it.
    const V = this.view;
    V.clear();
    V.draw(this.ahead.setPosition(player.x, player.y).setRotation(this.aim));
    if (this.near) V.draw(this.near.setPosition(player.x, player.y));
    const reach = viewReach(this.shape);
    const g = this.shadows.clear().fillStyle(0xffffff, 1);
    shadowTriangles(this.eye, viewRays(this.world.sight, this.eye, reach, WALL_DEPTH), reach, reach + TILE, (ax, ay, bx, by, cx, cy) =>
      g.fillTriangle(ax, ay, bx, by, cx, cy),
    );
    V.erase(g);
    V.render();

    // The fog: his memory, hazy where he's never been, with what he sees cut out.
    const F = this.layer;
    F.clear();
    F.draw(this.memoryImage);
    if (f.unexploredHaze > 0) F.draw(this.hazeImage);
    F.erase(V);
    // People are containers, and Phaser draws a container's parts with the erase blend only when
    // the container has it itself (else they'd be painted on the fog): just for this draw, they do.
    const bodies = [player.view.container, ...seen];
    for (const c of bodies) c.setBlendMode(Phaser.BlendModes.ERASE);
    F.erase([...bodies, ...this.inView]);
    F.render();
    for (const c of bodies) c.setBlendMode(Phaser.BlendModes.SKIP_CHECK);
  }

  /** Explores what he sees and finds the things in his view, when he has moved or turned or a door has opened. */
  private look(): void {
    const doors = this.world.doors.reduce((n, d) => n + (d.locked ? 0 : 1), 0);
    const last = this.lastLook;
    const turned = !seesAllAround(this.shape) && !(Math.abs(angleDiff(last.aim, this.aim)) < 0.01);
    if (Math.abs(last.x - this.eye.x) < 1 && Math.abs(last.y - this.eye.y) < 1 && !turned && last.doors === doors) return;
    this.lastLook = { x: this.eye.x, y: this.eye.y, aim: this.aim, doors };

    const map = this.world.map;
    const found = exploreFrom(this.world.sight, this.eye, this.aim, this.shape, WALL_DEPTH, this.explored, map.width, map.height);
    if (found.length) {
      const ctx = this.haze.context;
      for (const i of found) ctx.clearRect(i % map.width, Math.floor(i / map.width), 1, 1);
      this.haze.refresh();
    }

    const reach = viewReach(this.shape);
    this.inView = [];
    for (const t of this.things) {
      const r = t.rect;
      const dx = Math.max(r.x - this.eye.x, 0, this.eye.x - r.right);
      const dy = Math.max(r.y - this.eye.y, 0, this.eye.y - r.bottom);
      if (dx * dx + dy * dy > reach * reach || !t.spots.some((p) => this.sees(p))) continue;
      this.inView.push(t.image);
      if (!t.look) {
        // Seen for the first time: into the memory with it.
        t.look = lookOf(t.image);
        this.dirty = true;
      }
    }
  }

  /** Redraws the memory when something in it has changed (at most every REDRAW_MS). */
  private remember(time: number): void {
    for (const t of this.things) {
      if (!t.look || looksLike(t.image, t.look)) continue;
      t.look = lookOf(t.image);
      this.dirty = true;
    }
    this.world.doors.forEach((d, i) => {
      if (looksLike(d.sprite, this.doorLooks[i])) return;
      this.doorLooks[i] = lookOf(d.sprite);
      this.dirty = true;
    });
    if (!this.dirty || time - this.drawnAt < REDRAW_MS) return;
    this.dirty = false;
    this.drawnAt = time;
    const things = this.things.filter((t) => t.look).map((t) => t.image).sort((a, b) => a.depth - b.depth);
    this.raw.clear();
    this.raw.draw([this.world.floor, this.world.walls, ...this.world.doors.map((d) => d.sprite), ...things]);
    this.raw.render();
    this.memory.clear();
    this.memory.draw(this.rawImage);
    this.memory.render();
  }

  /** Sizes and places the fog and the view over what the camera shows (plus a margin), on whole texels of the world. */
  private fit(): void {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    // The middle of the view (the camera's origin is its middle).
    const midX = cam.scrollX + cam.width / 2;
    const midY = cam.scrollY + cam.height / 2;
    const texel = 1 / SCALE;
    const x = Math.floor((midX - viewW / 2 - MARGIN) / texel) * texel;
    const y = Math.floor((midY - viewH / 2 - MARGIN) / texel) * texel;
    // Whole, even texels, with one to spare for the snapping.
    const w = Math.ceil(((viewW + MARGIN * 2) * SCALE + 1) / 2) * 2;
    const h = Math.ceil(((viewH + MARGIN * 2) * SCALE + 1) / 2) * 2;
    if (w !== this.size.w || h !== this.size.h) {
      this.size = { w, h };
      for (const rt of [this.layer, this.view]) {
        rt.resize(w, h);
        rt.camera.setZoom(SCALE);
      }
    }
    for (const rt of [this.layer, this.view]) {
      rt.setPosition(x, y);
      rt.camera.centerOn(x + w / SCALE / 2, y + h / SCALE / 2);
    }
  }

  destroy(): void {
    for (const o of [this.layer, this.view, this.rawImage, this.memoryImage, this.hazeImage, this.ahead, this.near, this.shadows]) o?.destroy();
    for (const key of [RAW_KEY, MEMORY_KEY, HAZE_KEY]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }
}
