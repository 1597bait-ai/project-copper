import Phaser from 'phaser';
import { BALANCE, TILE } from '../config/balance';
import type { Point } from '../systems/pathfinding';
import {
  beamFalloff,
  glowFalloff,
  indoorShare,
  lightLevel,
  lightRays,
  lightReach,
  reaches,
  shadowTriangles,
  type LightShape,
} from '../systems/lighting';
import { angleDiff } from '../systems/vision';
import { DEPTH } from '../ui/depth';
import { TILES } from './legend';
import type { World } from './World';

// The dark over the school and the lights in it (the rules are in src/systems/lighting.ts).
//
// Every frame two small textures covering the screen are redrawn: the LIGHT you carry (its glow
// and beam with the wall shadows cut out), then the DARK: the indoor darkness, with that light and
// the other people's cones (their flashlights) erased out of it. The dark lies over the people and
// things in the world, under speech bubbles, '!' marks and floating text, so what people shout
// still shows from the dark.

/** Someone whose vision cone lights the dark: the outline it was last drawn with (null off screen), starting at them. */
export interface ConeLight extends Point {
  readonly conePoints: readonly Point[] | null;
  readonly visionCone: { range: number };
}

/** Textures drawn when a shift starts: the light's shapes (the beam's width is tuned) and the map's dark. */
const GLOW_KEY = 'light-glow';
const BEAM_KEY = 'light-beam';
const AMBIENT_KEY = 'light-ambient';
/** The light textures measure this many px from the middle to the rim. */
const LIGHT_TEX = 128;
/** The light and the dark are drawn at a quarter of the world's resolution (a texel per art pixel), smoothed when stretched. */
const SCALE = 0.25;
/** Spots per tile across and down in the indoor/outdoor map. */
const AMBIENT_PER_TILE = 2;
/** The dark reaches this far past the screen's edges, so it still covers them while the camera catches up. */
const MARGIN = TILE * 2;
/** The light shows on the face of a wall up to this deep (but never through it). */
const WALL_DEPTH = TILE * 0.8;
/** Light spilling round someone holding a flashlight or phone, so you can make them out (radius, px). */
const SPILL = TILE * 0.9;
/** A vision cone's light fades to this share of its brightness at the cone's full reach. */
const CONE_FAR = 0.45;

/** A texture of white light whose alpha is `level(u, angle)`, `u` the distance from the middle over LIGHT_TEX. */
function lightTexture(textures: Phaser.Textures.TextureManager, key: string, level: (u: number, angle: number) => number): void {
  if (textures.exists(key)) textures.remove(key);
  const size = LIGHT_TEX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - LIGHT_TEX;
      const dy = y + 0.5 - LIGHT_TEX;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(255 * level(Math.hypot(dx, dy) / LIGHT_TEX, Math.atan2(dy, dx)));
    }
  }
  ctx.putImageData(img, 0, 0);
  addTexture(textures, key, canvas);
}

/** A plain texture from a canvas, smoothed when stretched (light has no pixels to keep crisp). */
function addTexture(textures: Phaser.Textures.TextureManager, key: string, canvas: HTMLCanvasElement): void {
  const tex = textures.create(key, canvas, canvas.width, canvas.height)!;
  tex.add('__BASE', 0, 0, 0, canvas.width, canvas.height);
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/** The light you carry, in world px (BALANCE.lighting, read every shift). */
export function carriedLight(): LightShape {
  const t = BALANCE.lighting;
  return { glow: t.glowTiles * TILE, beam: t.beamTiles * TILE, beamHalfAngle: Phaser.Math.DegToRad(t.beamHalfAngleDeg) };
}

export class Lighting {
  /** The dark over the world, redrawn every frame. */
  readonly layer: Phaser.GameObjects.RenderTexture;
  /** The light you carry with its shadows cut out (drawn into the dark, never shown on its own). */
  private readonly light: Phaser.GameObjects.RenderTexture;
  // What's drawn into those two (through their cameras, in world px; none of it is shown itself).
  private readonly glow: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly ambient: Phaser.GameObjects.Image;
  /** The light round each person holding one (see SPILL), one image each so each keeps its spot. */
  private readonly spills: Phaser.GameObjects.Image[] = [];
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly cones: Phaser.GameObjects.Graphics;
  readonly shape: LightShape;
  /** Where the beam points (radians). It swings round to where you face. */
  aim: number;
  private size = { w: 0, h: 0 };
  private lastTime = -1;

  /**
   * The lighting for a shift, or null when it's off (darkness 0) or can't be drawn (the Canvas
   * renderer, on the rare browser without WebGL: the school is lit there).
   */
  static create(scene: Phaser.Scene, world: World, player: { facing: number }): Lighting | null {
    if (BALANCE.lighting.darkness <= 0 || scene.game.renderer.type !== Phaser.WEBGL) return null;
    return new Lighting(scene, world, player.facing);
  }

  private constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    aim: number,
  ) {
    this.shape = carriedLight();
    this.aim = aim;
    const textures = scene.textures;
    if (!textures.exists(GLOW_KEY)) lightTexture(textures, GLOW_KEY, (u) => glowFalloff(u));
    const half = this.shape.beamHalfAngle;
    lightTexture(textures, BEAM_KEY, (u, angle) => (half > 0 ? beamFalloff(u, Math.abs(angle) / half) : 0));
    this.drawAmbient();

    this.layer = scene.add.renderTexture(0, 0, 2, 2).setOrigin(0, 0).setDepth(DEPTH.darkness);
    this.light = new Phaser.GameObjects.RenderTexture(scene, 0, 0, 2, 2).setOrigin(0, 0);
    for (const rt of [this.layer, this.light]) {
      rt.setScale(1 / SCALE);
      rt.camera.setOrigin(0, 0).setZoom(SCALE);
      rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    // (Texture stamps would be simpler, but in Phaser 4.2 they don't show up in these textures.)
    this.glow = new Phaser.GameObjects.Image(scene, 0, 0, GLOW_KEY).setScale(this.shape.glow / LIGHT_TEX);
    this.beam = new Phaser.GameObjects.Image(scene, 0, 0, BEAM_KEY).setScale(this.shape.beam / LIGHT_TEX);
    this.ambient = new Phaser.GameObjects.Image(scene, 0, 0, AMBIENT_KEY).setOrigin(0, 0).setScale(TILE / AMBIENT_PER_TILE);
    this.shadows = scene.make.graphics({}, false);
    this.cones = scene.make.graphics({}, false);
  }

  /** The indoor/outdoor darkness of the whole map, with this shift's darkness and daylight in it. */
  private drawAmbient(): void {
    const t = BALANCE.lighting;
    const map = this.world.map;
    const share = indoorShare(
      {
        width: map.width,
        height: map.height,
        wall: (x, y) => map.walls[y][x] >= 0,
        outside: (x, y) => TILES[map.floor[y][x]]?.room === 'outside',
      },
      AMBIENT_PER_TILE,
    );
    const w = map.width * AMBIENT_PER_TILE;
    const h = map.height * AMBIENT_PER_TILE;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const r = (t.color >> 16) & 255;
    const g = (t.color >> 8) & 255;
    const b = t.color & 255;
    const outdoors = 1 - t.daylight;
    for (let i = 0; i < share.length; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(255 * t.darkness * (share[i] + (1 - share[i]) * outdoors));
    }
    ctx.putImageData(img, 0, 0);
    if (this.scene.textures.exists(AMBIENT_KEY)) this.scene.textures.remove(AMBIENT_KEY);
    addTexture(this.scene.textures, AMBIENT_KEY, canvas);
  }

  /**
   * How brightly your light lights world spot `p` right now (0-1), walls and all: what the light
   * texture holds there, for tests.
   */
  levelAt(from: Point, p: Point): number {
    const reach = lightReach(this.shape);
    if (BALANCE.lighting.shadows === 'walls' && !reaches(this.world.sight, from, p, reach, WALL_DEPTH)) return 0;
    return lightLevel(p.x - from.x, p.y - from.y, this.aim, this.shape);
  }

  /** Redraws the light and the dark for this frame. `time` in ms (scene time). */
  update(player: Point & { facing: number }, gravy: ConeLight, students: readonly ConeLight[], time: number): void {
    const t = BALANCE.lighting;
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    // The beam swings round to where you face: 95% of the way in beamTurnSeconds.
    const k = t.beamTurnSeconds > 0 ? 1 - Math.exp((-3 * dt) / t.beamTurnSeconds) : 1;
    this.aim = Phaser.Math.Angle.Wrap(this.aim + angleDiff(this.aim, player.facing) * k);

    this.fit();

    // Your light, the shadows behind the walls cut out of it.
    const L = this.light;
    L.clear();
    if (this.shape.glow > 0) L.draw(this.glow.setPosition(player.x, player.y));
    if (this.shape.beam > 0 && this.shape.beamHalfAngle > 0) L.draw(this.beam.setPosition(player.x, player.y).setRotation(this.aim));
    if (t.shadows === 'walls') {
      const reach = lightReach(this.shape);
      const rays = lightRays(this.world.sight, player, reach, WALL_DEPTH);
      const g = this.shadows.clear().fillStyle(0xffffff, 1);
      shadowTriangles(player, rays, reach, reach + TILE, (ax, ay, bx, by, cx, cy) => g.fillTriangle(ax, ay, bx, by, cx, cy));
      L.erase(g);
    }
    L.render();

    // The dark: indoors (and outdoors at dusk), less wherever a light shines.
    const D = this.layer;
    D.clear();
    D.draw(this.ambient);
    D.erase(L);
    // Mr. Gravy's flashlight and the students' phones: their vision cones, and a little round them.
    const g = this.cones.clear();
    let n = 0;
    const shine = (who: ConeLight, light: number) => {
      const pts = who.conePoints;
      if (light <= 0 || !pts || pts.length < 3) return;
      // A fan from the person (the outline's first point), dimmer the further it reaches.
      const o = pts[0];
      const range = who.visionCone.range;
      const at = (p: Point) => light * (1 - (1 - CONE_FAR) * Math.min(1, Math.hypot(p.x - o.x, p.y - o.y) / range));
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, light, at(a), at(b), at(b)).fillTriangle(o.x, o.y, a.x, a.y, b.x, b.y);
      }
      const spill = (this.spills[n++] ??= new Phaser.GameObjects.Image(this.scene, 0, 0, GLOW_KEY).setScale(SPILL / LIGHT_TEX));
      D.erase(spill.setPosition(who.x, who.y - TILE * 0.4).setAlpha(light));
    };
    shine(gravy, t.gravyLight);
    for (const s of students) shine(s, t.studentLight);
    D.erase(g);
    D.render();
  }

  /** Sizes and places both textures over what the camera shows (plus a margin), on whole texels of the world. */
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
      for (const rt of [this.layer, this.light]) {
        rt.resize(w, h);
        rt.camera.setOrigin(0, 0).setZoom(SCALE);
      }
    }
    for (const rt of [this.layer, this.light]) {
      rt.setPosition(x, y);
      rt.camera.setScroll(x, y);
    }
  }

  destroy(): void {
    for (const o of [this.layer, this.light, this.glow, this.beam, this.ambient, ...this.spills, this.shadows, this.cones]) o.destroy();
  }
}
