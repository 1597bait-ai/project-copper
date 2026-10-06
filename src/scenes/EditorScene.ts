import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { DECOR } from '../config/decor';
import { FIXTURES } from '../config/fixtures';
import { doorKey } from '../entities/Door';
import { fixtureLook } from '../entities/Fixture';
import { loadSave } from '../systems/save';
import { sfx, unlockAudio } from '../systems/sfx';
import { COLORS, cssPerGamePixel, isPortrait, isTouchDevice, textStyle } from '../ui/theme';
import {
  ERASER,
  EditHistory,
  ROUTE_STOP,
  VAN,
  describeCell,
  isBlockTool,
  isDragTool,
  lineCells,
  loadEditorMap,
  paint,
  reconcileNames,
  saveEditorMap,
  vanRect,
} from '../world/editing';
import { TILESET_MARGIN, TILESET_SPACING, TILESET_TEXTURE, TILE_FRAMES, frameName, iconFrame, tileLayers } from '../world/autotile';
import { DECOR_CHARS, FIXTURE_CHARS, OBJECT_BY_CHAR, TILES } from '../world/legend';
import { parseMap, serializeMap, type ParsedMap, type TilePoint } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';
import { validateMap, type MapReport } from '../world/validate';
import { decorKey, fixtureMount, standOnFloor, vanKey } from '../world/World';

type Camera = Phaser.Cameras.Scene2D.Camera;
type Pointer = Phaser.Input.Pointer;

/** Palette entries that aren't paint tools. */
const PAN = 'pan';
const TURN_VAN = 'turn-van';

type Group = 'Tools' | 'Floors' | 'Walls' | 'Things';

interface ToolDef {
  id: string;
  group: Group;
  /** Short label under the palette icon. */
  label: string;
  /** Full name for the info line. */
  name: string;
}

interface PaletteItem {
  tool: ToolDef;
  /** In palette-camera space. */
  rect: Phaser.Geom.Rectangle;
  bg: Phaser.GameObjects.Graphics;
}

type Icon = Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | Phaser.GameObjects.Container;

interface Snapshot {
  rows: string[];
  names: ParsedMap['names'];
}

const TILE_LABELS: Record<string, string> = {
  '.': 'Hallway',
  ',': 'Class',
  '~': 'Blue tile',
  '^': 'Pink tile',
  b: 'Boiler',
  o: 'Office',
  j: 'Janitor',
  p: 'Asphalt',
  '|': 'Lines',
  _: 'Sidewalk',
  g: 'Grass',
  '#': 'Wall',
  B: 'Brick',
  F: 'Fence',
  '=': 'Lobby',
  k: 'Storage',
  n: 'Lounge',
  W: 'Board',
};

const FIXTURE_LABELS: Record<string, string> = {
  drinking_fountain: 'Fountain',
  wall_heater: 'Heater',
  toilet: 'Toilet',
  mop_sink: 'Mop sink',
  abandoned_copper_pile: 'Copper',
  desk: 'Desk',
  lamp: 'Lamp',
  electric_panel: 'Panel',
};

const DECOR_LABELS: Record<string, string> = {
  plant: 'Plant',
  trash_can: 'Trash can',
  tree: 'Tree',
  car: 'Car',
};

/** Every palette entry, in palette order. New tiles, fixtures and decorations in the legend show up automatically. */
function toolList(): ToolDef[] {
  const tiles: ToolDef[] = TILES.map((t) => ({
    id: t.char,
    group: t.layer === 'floor' ? 'Floors' : 'Walls',
    label: TILE_LABELS[t.char] ?? t.name.split(' ')[0].replace(/'s$/, ''),
    name: t.name,
  }));
  const fixtures: ToolDef[] = Object.entries(FIXTURE_CHARS).map(([ch, id]) => {
    const name = FIXTURES[id]?.name ?? id;
    return { id: ch, group: 'Things', label: FIXTURE_LABELS[id] ?? name.split(' ').pop()!, name };
  });
  const decor: ToolDef[] = Object.entries(DECOR_CHARS).map(([ch, id]) => {
    const name = DECOR[id]?.name ?? id;
    return { id: ch, group: 'Things', label: DECOR_LABELS[id] ?? name.split(' ').pop()!, name };
  });
  const thing = (id: string, label: string, name: string): ToolDef => ({ id, group: 'Things', label, name });
  return [
    { id: PAN, group: 'Tools', label: 'Pan', name: 'Pan' },
    { id: ERASER, group: 'Tools', label: 'Eraser', name: 'Eraser' },
    ...tiles.filter((t) => t.group === 'Floors'),
    ...tiles.filter((t) => t.group === 'Walls'),
    ...fixtures,
    ...decor,
    thing('P', 'Dalton', 'Player start'),
    thing('G', 'Gravy', 'Mr. Gravy start'),
    thing('S', 'Student', 'Student'),
    thing('L', 'Locked', 'Locked door'),
    thing(VAN, 'Van', 'Van'),
    thing(TURN_VAN, 'Turn van', 'Turn the van'),
    thing(ROUTE_STOP, 'Route', "Mr. Gravy's route stop"),
  ];
}

const GROUPS: Group[] = ['Tools', 'Floors', 'Walls', 'Things'];
const PANEL = 0x12151c;
const GREY = 0x3d4558;
const GREEN = 0x3f9a4a;
const RED = 0xc8443b;
const ROUTE_COLOR = 0xffc23d;
/** A second RESET tap sooner than this is the same double-click or double-tap, not a confirmation. */
const RESET_CONFIRM_MIN_MS = 400;
/** Room-name tags are drawn at this size, then scaled to stay readable at any zoom. */
const NAME_TAG_PX = 36;
/** ...but no bigger than this when zoomed far out, so a tag doesn't swallow its room. */
const NAME_TAG_MAX_SCALE = 1.4;
/** MouseEvent.buttons bit for each MouseEvent.button. */
const MOUSE_BITS = [1, 4, 2, 8, 16];

/** A flat rounded button hit-tested by the scene (so a drag that ends on it never clicks it). */
class UiButton {
  readonly root: Phaser.GameObjects.Container;
  readonly label: Phaser.GameObjects.Text;
  readonly rect = new Phaser.Geom.Rectangle();
  enabled = true;
  private readonly bg: Phaser.GameObjects.Graphics;
  private hover = false;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly u: number,
    text: string,
    private fill: number,
    fontSize: number,
    readonly onClick: () => void,
  ) {
    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, text, textStyle(fontSize)).setOrigin(0.5);
    this.root = scene.add.container(0, 0, [this.bg, this.label]);
  }

  place(x: number, y: number, w: number, h: number): this {
    this.rect.setTo(x, y, w, h);
    this.root.setPosition(x + w / 2, y + h / 2);
    this.draw();
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    this.draw();
    return this;
  }

  setFill(fill: number): this {
    this.fill = fill;
    this.draw();
    return this;
  }

  setEnabled(on: boolean): this {
    if (this.enabled !== on) {
      this.enabled = on;
      this.draw();
    }
    return this;
  }

  setHover(on: boolean): void {
    if (this.hover !== on) {
      this.hover = on;
      this.draw();
    }
  }

  setPressed(on: boolean): void {
    this.pressed = on;
    this.root.setScale(on ? 0.95 : 1);
  }

  private draw() {
    const { width: w, height: h } = this.rect;
    const r = Math.min(10 * this.u, h / 3);
    const color = !this.enabled ? 0x2a2f3d : this.hover ? Phaser.Display.Color.ValueToColor(this.fill).lighten(12).color : this.fill;
    const g = this.bg.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2 * this.u, -h / 2 + 3 * this.u, w, h, r);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(2 * this.u, 0x14161c, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    if (this.enabled) g.fillStyle(0xffffff, 0.14).fillRoundedRect(-w / 2 + 4 * this.u, -h / 2 + 3 * this.u, w - 8 * this.u, h * 0.3, r * 0.6);
    this.label.setAlpha(this.enabled ? 1 : 0.45).setScale(1);
    if (this.label.width > w - 8 * this.u) this.label.setScale((w - 8 * this.u) / this.label.width);
    this.root.setScale(this.pressed ? 0.95 : 1);
  }
}

/**
 * In-game map editor: paint floors and walls, place things, see problems live, play the map
 * right away and copy its text out. Three cameras: the zoomable map, the scrolling palette and
 * the fixed UI on top. All pointer hit-testing is done here by screen rectangles, so a tap on
 * the UI never paints the map.
 */
export class EditorScene extends Phaser.Scene {
  // ---- map state
  private rows: string[] = [];
  private names: ParsedMap['names'] = [];
  /** The built-in map this working copy started from (saved with it). */
  private base = '';
  private parsed!: ParsedMap;
  private report: MapReport = { errors: [], warnings: [] };
  private history = new EditHistory<Snapshot>(100);
  private readonly tools = toolList();
  private toolId = '#';
  private vanRotated = false;

  // ---- flags and timers
  private alive = false;
  private touch = false;
  private portrait = false;
  /** Game pixels per CSS pixel, so UI sizes are physical sizes. */
  private u = 1;
  private dirty = false;
  /** Edited since the last save: only real edits are written, so an untouched copy never goes stale. */
  private unsaved = false;
  private fitted = true;
  private problemsOpen = false;
  private resetArmed = false;
  private resetArmedAt = 0;
  private saveFailed = false;
  private validateTimer: Phaser.Time.TimerEvent | null = null;
  private saveTimer: Phaser.Time.TimerEvent | null = null;
  private resetTimer: Phaser.Time.TimerEvent | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private cursorStyle = '';

  // ---- map rendering
  private mapCam!: Camera;
  private palCam!: Camera;
  private uiCam!: Camera;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private shownFloor: number[][] = [];
  private shownWalls: number[][] = [];
  private gridGfx!: Phaser.GameObjects.Graphics;
  private rulers: Phaser.GameObjects.Text[] = [];
  private objects!: Phaser.GameObjects.Container;
  private objectsKey = '';
  /** Room-name tags on the map; kept the same size on screen like the rulers. */
  private nameTags: Phaser.GameObjects.Text[] = [];
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private gridZoom = 0;

  // ---- UI (rebuilt by layout())
  private uiRoot: Phaser.GameObjects.Container | null = null;
  private palRoot: Phaser.GameObjects.Container | null = null;
  private buttons: UiButton[] = [];
  private undoBtn!: UiButton;
  private redoBtn!: UiButton;
  private resetBtn!: UiButton;
  private playBtn!: UiButton;
  private infoText!: Phaser.GameObjects.Text;
  private saveText!: Phaser.GameObjects.Text;
  private toastText: Phaser.GameObjects.Text | null = null;
  /** The toast explains why PLAY refused, so it goes away once the map is playable. */
  private toastIsProblem = false;
  private probGfx!: Phaser.GameObjects.Graphics;
  private probTitle!: Phaser.GameObjects.Text;
  private probBody!: Phaser.GameObjects.Text;
  private palItems: PaletteItem[] = [];
  private palBar!: Phaser.GameObjects.Graphics;
  private vanIcons: Phaser.GameObjects.Image[] = [];
  private readonly topRect = new Phaser.Geom.Rectangle();
  private readonly palRect = new Phaser.Geom.Rectangle();
  private readonly mapRect = new Phaser.Geom.Rectangle();
  private readonly probRect = new Phaser.Geom.Rectangle();
  private probArea = { x: 0, w: 0, bottom: 0 };
  private palVertical = true;
  private palScroll = 0;
  private palMax = 0;

  // ---- pointer state
  private hoverCell: TilePoint | null = null;
  private hoverBtn: UiButton | null = null;
  /** Palette entry under the mouse, named in the info line. */
  private hoverTool: ToolDef | null = null;
  private stroke: { id: number; before: Snapshot; last: TilePoint | null } | null = null;
  private panDrag: { id: number; x: number; y: number } | null = null;
  private tap: { id: number; x: number; y: number } | null = null;
  private palDrag: { id: number; x: number; y: number; start: number; moved: boolean; last: number; at: number; vel: number } | null = null;
  /** Palette scroll speed after a flick, in game px per ms. */
  private palFling = 0;
  private pressed: { id: number; button: UiButton } | null = null;
  /** The mouse button that started the current mouse gesture (one at a time). */
  private mouse: { id: number; button: number } | null = null;
  private probPress: number | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; world: { x: number; y: number } } | null = null;
  /** After a pinch, the finger left on the screen does nothing until it lifts. */
  private touchLock = false;
  private held = new Set<string>();
  private overlay: HTMLDivElement | null = null;

  /** A map handed over by the scene that opened the editor (e.g. "EDIT MAP" after playing it). */
  private incoming: string | null = null;

  constructor() {
    super('Editor');
  }

  init(data?: { mapText?: string }): void {
    this.incoming = data?.mapText ?? null;
  }

  create(): void {
    this.alive = true;
    this.touch = isTouchDevice();
    this.toolId = this.touch ? PAN : '#';
    this.vanRotated = false;
    this.history = new EditHistory<Snapshot>(100);
    this.report = { errors: [], warnings: [] };
    this.dirty = false;
    this.unsaved = false;
    this.fitted = true;
    this.problemsOpen = false;
    this.resetArmed = false;
    this.resetArmedAt = 0;
    this.saveFailed = false;
    this.validateTimer = this.saveTimer = this.resetTimer = this.toastTimer = null;
    this.cursorStyle = '';
    this.tilemap = null;
    this.objectsKey = '';
    this.nameTags = [];
    this.gridZoom = 0;
    this.rulers = [];
    this.uiRoot = this.palRoot = null;
    this.toastText = null;
    this.toastIsProblem = false;
    this.palScroll = 0;
    this.hoverCell = this.hoverBtn = this.hoverTool = null;
    this.stroke = this.panDrag = this.tap = this.palDrag = this.pressed = this.mouse = null;
    this.palFling = 0;
    this.probPress = null;
    this.touches.clear();
    this.pinch = null;
    this.touchLock = false;
    this.held.clear();
    this.overlay = null;

    // A map handed over wins over the saved copy: it's what was just played, even if saving is blocked.
    const start = this.incoming ? { text: this.incoming, base: DEFAULT_MAP.text, builtInChanged: false } : loadEditorMap(DEFAULT_MAP.text);
    let map = parseMap(start.text);
    this.base = start.base;
    if (map.width < 1 || map.height < 1) {
      map = parseMap(DEFAULT_MAP.text);
      this.base = DEFAULT_MAP.text;
    }
    this.rows = map.rows;
    // Room names that don't point at a room can't be fixed in the editor, so they go.
    const names = reconcileNames(map.rows, map.rows, map.names);
    this.names = names.names;

    this.mapCam = this.cameras.main.setBackgroundColor('#0b0d12');
    this.palCam = this.cameras.add(0, 0, 1, 1).setBackgroundColor(PANEL);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);

    this.gridGfx = this.add.graphics().setDepth(2);
    this.objects = this.add.container(0, 0).setDepth(3);
    this.cursorGfx = this.add.graphics().setDepth(4);
    this.onlyOn(this.mapCam, this.gridGfx, this.objects, this.cursorGfx);

    this.refresh();
    this.report = validateMap(this.parsed);
    this.layout();
    this.fitView();
    if (start.builtInChanged) {
      this.toast('The built-in school was updated since you started this map. RESET loads the new one (UNDO brings yours back).', COLORS.warn, 7000);
      // Said once: the next save records the new built-in map as this copy's base.
      this.base = DEFAULT_MAP.text;
    } else if (names.dropped.length) this.toastDropped(names.dropped, false);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.flushSave);
    document.addEventListener('visibilitychange', this.flushSave);
    this.game.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.cameras.main.fadeIn(250, 20, 22, 28);
  }

  private shutdown() {
    this.alive = false;
    // The scene's objects are already destroyed by now: drop the UI before anything can touch it.
    this.uiRoot = this.palRoot = this.toastText = null;
    this.buttons = [];
    this.palItems = [];
    this.nameTags = [];
    if (this.unsaved) this.saveNow();
    this.closeOverlay();
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.flushSave);
    document.removeEventListener('visibilitychange', this.flushSave);
    this.game.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.input.setDefaultCursor('');
    this.tilemap?.destroy();
    this.tilemap = null;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const k = this.held;
    const dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if ((dx || dy) && !this.overlay) {
      const step = (this.mapRect.height * 1.1 * dt) / this.mapCam.zoom;
      this.scrollBy(dx * step, dy * step);
    }
    if (this.palFling) {
      const before = this.palScroll;
      this.setPalScroll(this.palScroll + this.palFling * dt * 1000);
      this.palFling *= Math.exp(-dt * 3);
      if (Math.abs(this.palFling) < 0.05 || this.palScroll === before) this.palFling = 0;
    }
    if (this.dirty) this.refresh();
  }

  /** Only `cam` renders (and hit-tests) these objects. */
  private onlyOn(cam: Camera, ...objs: Phaser.GameObjects.GameObject[]) {
    const all = this.mapCam.id | this.palCam.id | this.uiCam.id;
    for (const o of objs) o.cameraFilter = all & ~cam.id;
  }

  // ---- map model ----------------------------------------------------------

  private get tool(): ToolDef {
    return this.tools.find((t) => t.id === this.toolId) ?? this.tools[0];
  }

  private snapshot(): Snapshot {
    return { rows: this.rows, names: this.names };
  }

  private mapText(): string {
    return serializeMap(this.rows, this.names);
  }

  /** The map changed: redraw next frame, re-check problems and autosave soon. */
  private changed() {
    this.dirty = true;
    this.unsaved = true;
    this.scheduleValidation();
    this.saveTimer?.remove(false);
    this.saveTimer = this.time.delayedCall(700, () => this.saveNow());
    if (this.uiRoot) this.saveText.setText('Saving…').setColor(COLORS.muted);
  }

  /** Problems are re-checked once a stroke is over: mid-stroke the room names aren't settled yet. */
  private scheduleValidation() {
    this.validateTimer?.remove(false);
    this.validateTimer = this.time.delayedCall(300, () => {
      this.validateTimer = null;
      if (this.stroke) this.scheduleValidation();
      else this.runValidation();
    });
  }

  /** The room names for `rows` after an edit from `before`, saying which ones had to go. */
  private namesAfter(before: Snapshot, rows: string[]): ParsedMap['names'] {
    const fix = reconcileNames(before.rows, rows, before.names);
    if (fix.dropped.length) this.toastDropped(fix.dropped);
    return fix.names;
  }

  /** `undoable` is false for names dropped while loading (they were already broken). */
  private toastDropped(dropped: ParsedMap['names'], undoable = true) {
    const list = dropped.map((n) => `"${n.name}"`).join(', ');
    const one = dropped.length === 1;
    const what = one ? `Room name ${list} removed: its room is gone.` : `Room names ${list} removed: their rooms are gone.`;
    this.toast(undoable ? `${what} UNDO brings ${one ? 'it' : 'them'} back.` : what, COLORS.warn, 4500);
  }

  /** One undoable action that replaces the whole map. Shown right away (strokes redraw once per frame). */
  private commit(rows: string[], names = this.names) {
    this.history.record(this.snapshot());
    this.rows = rows;
    this.names = names;
    this.changed();
    this.refresh();
  }

  private restore(s: Snapshot) {
    this.rows = s.rows;
    this.names = s.names;
    this.changed();
    this.refresh();
  }

  /** Closing or hiding the tab can't wait for the autosave timer. */
  private flushSave = (e: Event) => {
    if (this.unsaved && (e.type === 'pagehide' || document.visibilityState === 'hidden')) this.saveNow();
  };

  private saveNow() {
    this.saveTimer?.remove(false);
    this.saveTimer = null;
    const ok = saveEditorMap(this.mapText(), this.base);
    this.unsaved = !ok;
    if (!ok && !this.saveFailed && this.alive) this.toast("This browser won't let the editor save. Use COPY MAP to keep your work.", COLORS.warn, 5000);
    this.saveFailed = !ok;
    if (this.uiRoot) this.saveText.setText(ok ? 'Saved' : 'Not saved').setColor(ok ? COLORS.good : COLORS.warn);
  }

  private runValidation() {
    this.validateTimer?.remove(false);
    this.validateTimer = null;
    if (this.dirty) this.refresh();
    this.report = validateMap(this.parsed);
    this.renderProblems();
  }

  /** Re-reads the map and updates only what changed on screen. */
  private refresh() {
    this.dirty = false;
    this.parsed = parseMap(this.mapText());
    const map = this.parsed;
    if (!this.tilemap || this.tilemap.width !== map.width || this.tilemap.height !== map.height) this.buildMapLayers(map.width, map.height);
    // Same autotiling as the game. Every cell is re-picked, so painting a wall also fixes up the
    // walls and floor shadows around it; only cells whose frame changed are touched.
    const frames = tileLayers(map);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const f = frames.floor[y][x];
        if (this.shownFloor[y][x] !== f) {
          if (f >= 0) this.floorLayer.putTileAt(f, x, y);
          else this.floorLayer.removeTileAt(x, y);
          this.shownFloor[y][x] = f;
        }
        const w = frames.walls[y][x];
        if (this.shownWalls[y][x] !== w) {
          if (w >= 0) this.wallLayer.putTileAt(w, x, y);
          else this.wallLayer.removeTileAt(x, y);
          this.shownWalls[y][x] = w;
        }
      }
    }
    const key = this.computeObjectsKey();
    if (key !== this.objectsKey) {
      this.objectsKey = key;
      this.rebuildObjects();
    }
    if (this.uiRoot) {
      this.undoBtn.setEnabled(this.history.canUndo);
      this.redoBtn.setEnabled(this.history.canRedo);
      this.updateInfo();
    }
  }

  private buildMapLayers(width: number, height: number) {
    this.tilemap?.destroy();
    const tilemap = this.make.tilemap({ width, height, tileWidth: TILE, tileHeight: TILE });
    const tileset = tilemap.addTilesetImage('school', TILESET_TEXTURE, TILE, TILE, TILESET_MARGIN, TILESET_SPACING)!;
    this.floorLayer = tilemap.createBlankLayer('floor', tileset, 0, 0)!.setDepth(0);
    this.wallLayer = tilemap.createBlankLayer('walls', tileset, 0, 0)!.setDepth(1);
    this.onlyOn(this.mapCam, this.floorLayer, this.wallLayer);
    this.tilemap = tilemap;
    this.shownFloor = Array.from({ length: height }, () => new Array<number>(width).fill(-2));
    this.shownWalls = Array.from({ length: height }, () => new Array<number>(width).fill(-2));
    this.objectsKey = '';

    // Tile numbers every 5 tiles along the top and left edges, for "@ x,y" lines.
    this.rulers.forEach((r) => r.destroy());
    this.rulers = [];
    const ruler = (x: number, y: number, n: number) => {
      const t = this.add.text(x, y, String(n), textStyle(40, COLORS.muted)).setOrigin(0.5).setDepth(2);
      this.onlyOn(this.mapCam, t);
      this.rulers.push(t);
    };
    for (let x = 0; x < width; x += 5) ruler((x + 0.5) * TILE, -TILE * 0.6, x);
    for (let y = 0; y < height; y += 5) ruler(-TILE * 0.6, (y + 0.5) * TILE, y);
    this.gridZoom = 0;
  }

  /** Changes whenever something on the object layer would look different. */
  private computeObjectsKey(): string {
    const map = this.parsed;
    let key = '';
    for (let y = 0; y < map.height; y++) {
      const row = map.rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (!(ch in OBJECT_BY_CHAR)) continue;
        key += `${x},${y}${ch}`;
        const id = FIXTURE_CHARS[ch];
        if (id && FIXTURES[id]?.wallMounted) key += fixtureMount(map, x, y);
        key += ';';
      }
    }
    for (const n of this.names) key += `@${n.x},${n.y} ${n.name};`;
    return key;
  }

  private rebuildObjects() {
    const map = this.parsed;
    const layer = this.objects;
    layer.removeAll(true);
    const center = (x: number, y: number) => ({ cx: (x + 0.5) * TILE, cy: (y + 0.5) * TILE });
    const image = (key: string, x = 0, y = 0) => this.add.image(x, y, this.textures.exists(key) ? key : '__MISSING');

    for (const d of map.doors) {
      const rect = { width: d.w * TILE, height: d.h * TILE };
      layer.add(image(doorKey(rect, true, TILE), (d.x + d.w / 2) * TILE, (d.y + d.h / 2) * TILE).setDisplaySize(rect.width, rect.height));
    }

    // Things standing on the floor, drawn back to front like in the game (the container draws in list order).
    const standing: Phaser.GameObjects.Image[] = [];
    const stops: TilePoint[] = [];
    const strays = this.add.graphics();
    const v = map.van;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const ch = map.rows[y][x];
        const fixture = FIXTURE_CHARS[ch];
        const def = fixture ? FIXTURES[fixture] : undefined;
        if (def) {
          const look = fixtureLook(this.textures, def, def.wallMounted ? fixtureMount(map, x, y) : 'front');
          standing.push(standOnFloor(image(look.key).setFlipX(look.flipX), { x, y, w: 1, h: 1 }));
        } else if (ch === 'P' || ch === 'G' || ch === 'S') {
          // People face the camera, feet near the bottom of their tile.
          const person = standOnFloor(image(ch === 'P' ? 'dalton' : ch === 'G' ? 'mr_gravy' : 'student'), { x, y, w: 1, h: 1 });
          if (person.height > TILE * 1.6) person.setScale((TILE * 1.6) / person.height);
          standing.push(person.setY(person.y - 4));
        } else if (ch >= '1' && ch <= '9') {
          stops.push({ x, y });
        } else if (ch === VAN && !(v && x >= v.x && y >= v.y && x < v.x + v.w && y < v.y + v.h)) {
          // V tiles that aren't part of the van (a second or broken van): show them so they can be erased.
          strays.fillStyle(0xff5a4f, 0.45).fillRect(x * TILE, y * TILE, TILE, TILE);
          strays.lineStyle(4, 0xff5a4f, 1).strokeRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        }
      }
    }
    for (const d of map.decor) standing.push(standOnFloor(image(decorKey(d)), d));
    // Drawn facing the camera like World.ts: from the side when wide, from the front when tall.
    if (v) standing.push(standOnFloor(image(vanKey(v)), v).setDisplaySize(v.w * TILE, v.h * TILE));
    standing.sort((a, b) => a.depth - b.depth);
    layer.add(standing);
    layer.add(strays);

    // Mr. Gravy's route: stops joined in order and back to the first, with arrows for direction.
    const route = this.add.graphics();
    const pts = map.patrol.map((p) => center(p.x, p.y));
    if (pts.length >= 2) {
      route.lineStyle(10, ROUTE_COLOR, 0.75);
      route.beginPath();
      route.moveTo(pts[0].cx, pts[0].cy);
      for (const p of pts.slice(1)) route.lineTo(p.cx, p.cy);
      route.closePath();
      route.strokePath();
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx);
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const tip = (d: number, off: number) => [mx + Math.cos(ang + off) * d, my + Math.sin(ang + off) * d] as const;
        const [x1, y1] = tip(22, 0);
        const [x2, y2] = tip(18, 2.5);
        const [x3, y3] = tip(18, -2.5);
        route.fillStyle(ROUTE_COLOR, 0.95).fillTriangle(x1, y1, x2, y2, x3, y3);
      });
    }
    for (const s of stops) {
      const { cx, cy } = center(s.x, s.y);
      route.fillStyle(ROUTE_COLOR, 1).fillCircle(cx, cy, 28);
      route.lineStyle(5, 0x14161c, 1).strokeCircle(cx, cy, 28);
    }
    layer.add(route);
    for (const s of stops) {
      const { cx, cy } = center(s.x, s.y);
      layer.add(this.add.text(cx, cy + 1, map.rows[s.y][s.x], textStyle(40, '#14161c', { strokeThickness: 0 })).setOrigin(0.5));
    }

    // Room names ("@ x,y Name" lines): an outlined tile with the name on it, so it's clear which
    // tile holds the name (the editor keeps it on its room as the map changes).
    const anchors = this.add.graphics();
    layer.add(anchors);
    this.nameTags = [];
    for (const n of this.names) {
      if (n.x >= map.width || n.y >= map.height) continue;
      anchors.lineStyle(6, 0xe8914a, 0.95).strokeRect(n.x * TILE + 3, n.y * TILE + 3, TILE - 6, TILE - 6);
      const { cx, cy } = center(n.x, n.y);
      const tag = this.add
        .text(cx, cy, n.name, textStyle(NAME_TAG_PX, '#ffe2c4', { backgroundColor: 'rgba(18,21,28,0.6)', padding: { x: 8, y: 4 }, strokeThickness: 0 }))
        .setOrigin(0.5)
        .setScale(this.labelScale(NAME_TAG_PX, NAME_TAG_MAX_SCALE));
      layer.add(tag);
      this.nameTags.push(tag);
    }
  }

  /** Scale for map labels drawn `basePx` tall so they stay about 12 CSS px tall at any zoom. */
  private labelScale(basePx: number, max = 1) {
    return Phaser.Math.Clamp((12 * this.u) / this.mapCam.zoom / basePx, 0.2, max);
  }

  // ---- layout -------------------------------------------------------------

  private onResize() {
    const c = this.mapCam;
    const mid = this.screenToWorld(c.x + c.width / 2, c.y + c.height / 2);
    this.layout();
    if (this.fitted) this.fitView();
    else this.setView(c.zoom, mid.x, mid.y);
  }

  /** Builds the palette and the UI for the current screen size. The map itself is untouched. */
  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const u = (this.u = 1 / Math.max(0.05, cssPerGamePixel(this.scale)));
    const portrait = (this.portrait = isPortrait(this.scale));
    const touch = this.touch;
    const m = 8 * u;
    const gap = 6 * u;
    const bh = (touch ? 46 : 38) * u;
    const fs = (touch ? 16 : 15) * u;

    this.uiRoot?.destroy();
    this.palRoot?.destroy();
    const ui = (this.uiRoot = this.add.container(0, 0));
    const pal = (this.palRoot = this.add.container(0, 0));
    this.onlyOn(this.uiCam, ui);
    this.onlyOn(this.palCam, pal);
    this.buttons = [];
    this.hoverBtn = null;
    this.pressed = null;
    this.toastText = null;
    this.uiCam.setViewport(0, 0, W, H);

    const topBg = this.add.graphics();
    ui.add(topBg);
    const button = (text: string, fill: number, onClick: () => void, size = fs) => {
      const b = new UiButton(this, u, text, fill, size, onClick);
      ui.add(b.root);
      this.buttons.push(b);
      return b;
    };
    const back = button('BACK', GREY, () => this.back());
    this.undoBtn = button('UNDO', GREY, () => this.undo());
    this.redoBtn = button('REDO', GREY, () => this.redo());
    this.resetBtn = button(this.resetArmed ? 'SURE?' : 'RESET', this.resetArmed ? RED : GREY, () => this.onReset());
    const copy = button('COPY MAP', 0x3a6ea5, () => this.copyMap());
    this.playBtn = button('PLAY', GREEN, () => this.play());

    // Top bar: BACK / UNDO / REDO on the left, RESET / COPY / PLAY on the right (second row if needed).
    const pad = (portrait ? 10 : 14) * u;
    const widthOf = (b: UiButton) => Math.max(b.label.width + pad * 2, (touch ? 64 : 56) * u);
    const rowWidth = (bs: UiButton[]) => bs.reduce((s, b) => s + widthOf(b), 0) + gap * (bs.length - 1);
    const left = [back, this.undoBtn, this.redoBtn];
    const right = [this.resetBtn, copy, this.playBtn];
    const lw = rowWidth(left);
    const rw = rowWidth(right);
    const oneRow = m + lw + gap * 4 + rw + m <= W;
    const placeRow = (bs: UiButton[], x: number, y: number) => {
      for (const b of bs) {
        b.place(x, y, widthOf(b), bh);
        x += widthOf(b) + gap;
      }
    };
    const rightY = oneRow ? m : m + bh + gap;
    placeRow(left, m, m);
    placeRow(right, W - m - rw, rightY);
    const title = this.add.text(0, 0, 'MAP EDITOR', textStyle(fs * 1.1, COLORS.copper)).setOrigin(0, 0.5);
    ui.add(title);
    const titleRoom = oneRow ? W - m - rw - (m + lw) : W - m - rw - m;
    if (titleRoom > title.width + gap * 6) {
      title.setPosition(oneRow ? m + lw + (titleRoom - title.width) / 2 : m, rightY + bh / 2);
    } else title.setVisible(false);

    const infoY = rightY + bh + gap;
    const infoH = (touch ? 26 : 22) * u;
    this.infoText = this.add.text(m, infoY + infoH / 2, '', textStyle(13 * u, COLORS.text)).setOrigin(0, 0.5);
    this.saveText = this.add.text(W - m, infoY + infoH / 2, this.saveFailed ? 'Not saved' : 'Saved', textStyle(12 * u, this.saveFailed ? COLORS.warn : COLORS.good)).setOrigin(1, 0.5);
    ui.add([this.infoText, this.saveText]);
    const topH = infoY + infoH + gap * 0.5;
    this.topRect.setTo(0, 0, W, topH);
    topBg.fillStyle(PANEL, 0.98).fillRect(0, 0, W, topH);
    topBg.fillStyle(0x000000, 0.25).fillRect(0, infoY - gap * 0.4, W, infoH + gap * 0.8);
    topBg.fillStyle(0xe8914a, 0.6).fillRect(0, topH - 2 * u, W, 2 * u);

    // Palette: a column on the left in landscape, a sideways-scrolling strip at the bottom in portrait.
    const itemW = (touch ? 68 : 60) * u;
    const itemH = itemW + 16 * u;
    const headerH = 18 * u;
    const groups = GROUPS.map((g) => this.tools.filter((t) => t.group === g));
    this.palVertical = !portrait;
    if (!portrait) {
      const availH = H - topH;
      const columnHeight = (cols: number) => groups.reduce((s, g) => s + headerH + Math.ceil(g.length / cols) * (itemH + gap) + gap, gap);
      const maxCols = Math.max(2, Math.min(4, Math.floor((W * 0.3 - gap) / (itemW + gap))));
      let cols = 2;
      while (cols < maxCols && columnHeight(cols) > availH) cols++;
      this.palRect.setTo(0, topH, cols * (itemW + gap) + gap, availH);
      this.mapRect.setTo(this.palRect.width, topH, W - this.palRect.width, availH);
      this.palMax = Math.max(0, columnHeight(cols) - availH);
    } else {
      const stripH = headerH + itemH + gap * 2;
      this.palRect.setTo(0, H - stripH, W, stripH);
      this.mapRect.setTo(0, topH, W, H - topH - stripH);
    }
    this.palItems = [];
    this.vanIcons = [];
    let px = gap;
    let py = gap;
    groups.forEach((list, gi) => {
      const header = this.add.text(px, py, GROUPS[gi].toUpperCase(), textStyle(11 * u, COLORS.muted)).setOrigin(0, 0);
      pal.add(header);
      const cols = this.palVertical ? Math.round((this.palRect.width - gap) / (itemW + gap)) : list.length;
      list.forEach((tool, i) => {
        const ix = px + (i % cols) * (itemW + gap);
        const iy = py + headerH + Math.floor(i / cols) * (itemH + gap);
        this.palItems.push(this.buildPaletteItem(pal, tool, ix, iy, itemW, itemH));
      });
      if (this.palVertical) py += headerH + Math.ceil(list.length / cols) * (itemH + gap) + gap;
      else px += list.length * (itemW + gap) + gap * 2;
    });
    if (!this.palVertical) this.palMax = Math.max(0, px - this.palRect.width);
    this.palCam.setViewport(this.palRect.x, this.palRect.y, this.palRect.width, this.palRect.height);
    this.mapCam.setViewport(this.mapRect.x, this.mapRect.y, this.mapRect.width, this.mapRect.height);
    this.palBar = this.add.graphics();
    ui.add(this.palBar);
    this.setPalScroll(this.palScroll);
    this.refreshPalette();

    // Zoom buttons: in the free end of the first toolbar row when the bar wraps (portrait), else in
    // the map's top-right corner.
    const zs = bh;
    // In the toolbar they may be a little narrower than tall, but stay at least 40 px wide.
    const zw = Math.min(zs, (W - m - (m + lw + gap * 2) - 2 * gap) / 3);
    const zoomRow = !oneRow && zw >= 40 * u;
    const zoom = [
      button('+', GREY, () => this.zoomBy(1.4), fs * 1.4),
      button('–', GREY, () => this.zoomBy(1 / 1.4), fs * 1.4),
      button('FIT', GREY, () => this.fitView(), fs * 0.8),
    ];
    zoom.forEach((b, i) => {
      if (zoomRow) b.place(W - m - (3 - i) * zw - (2 - i) * gap, m, zw, zs);
      else b.place(this.mapRect.right - m - zs, this.mapRect.y + m + i * (zs + gap), zs, zs);
    });

    // Problems panel along the bottom of the map.
    const probW = portrait ? this.mapRect.width - m * 2 : Math.min(560 * u, this.mapRect.width - m * (zoomRow ? 2 : 3) - (zoomRow ? 0 : zs));
    this.probArea = { x: this.mapRect.x + m, w: probW, bottom: this.mapRect.bottom - m };
    this.probGfx = this.add.graphics();
    this.probTitle = this.add.text(0, 0, '', textStyle(14 * u, COLORS.text)).setOrigin(0, 0);
    this.probBody = this.add.text(0, 0, '', textStyle(12.5 * u, COLORS.text, { wordWrap: { width: probW - 20 * u, useAdvancedWrap: true }, lineSpacing: 2 * u }));
    ui.add([this.probGfx, this.probTitle, this.probBody]);

    this.renderProblems();
    this.undoBtn.setEnabled(this.history.canUndo);
    this.redoBtn.setEnabled(this.history.canRedo);
    this.updateInfo();
    this.drawCursor();
  }

  private buildPaletteItem(pal: Phaser.GameObjects.Container, tool: ToolDef, x: number, y: number, w: number, h: number): PaletteItem {
    const u = this.u;
    const bg = this.add.graphics();
    const iconSize = w * 0.66;
    const icon = this.makeIcon(tool.id, iconSize);
    const label = this.add.text(w / 2, h - 4 * u, tool.label, textStyle(11 * u, COLORS.text)).setOrigin(0.5, 1);
    if (label.width > w - 4 * u) label.setScale((w - 4 * u) / label.width);
    icon.setPosition(w / 2, 4 * u + iconSize / 2 + 2 * u);
    pal.add(this.add.container(x, y, [bg, icon, label]));
    return { tool, rect: new Phaser.Geom.Rectangle(x, y, w, h), bg };
  }

  private makeIcon(id: string, s: number): Icon {
    const frame = id.length === 1 ? iconFrame(id) : -1;
    if (frame >= 0) return this.add.image(0, 0, TILESET_TEXTURE, frameName(TILE_FRAMES[frame])).setDisplaySize(s, s);
    const sprite = (key: string, size = s) => this.fitIcon(this.add.image(0, 0, this.textures.exists(key) ? key : '__MISSING'), size);
    const fixture = FIXTURE_CHARS[id];
    if (fixture) return sprite(fixture);
    const decor = DECOR_CHARS[id];
    if (decor) return sprite(decorKey({ id: decor, x: 0, y: 0 }));
    switch (id) {
      case 'P':
        return sprite('dalton');
      case 'G':
        return sprite('mr_gravy');
      case 'S':
        return sprite('student');
      case 'L':
        return sprite('door_locked');
      case VAN: {
        const img = sprite(this.vanRotated ? 'van_tall' : 'van', s * 1.05).setData('size', s * 1.05);
        this.vanIcons.push(img);
        return img;
      }
    }
    const g = this.add.graphics();
    const r = s / 2;
    switch (id) {
      case TURN_VAN:
        g.lineStyle(s * 0.1, 0xf6f1e5, 1);
        g.beginPath();
        g.arc(0, 0, r * 0.62, -Math.PI * 0.9, Math.PI * 0.5);
        g.strokePath();
        g.fillStyle(0xf6f1e5, 1).fillTriangle(-r * 0.15, r * 0.62, r * 0.25, r * 0.35, r * 0.25, r * 0.9);
        return g;
      case ROUTE_STOP: {
        g.fillStyle(ROUTE_COLOR, 1).fillCircle(0, 0, r * 0.7);
        g.lineStyle(s * 0.06, 0x14161c, 1).strokeCircle(0, 0, r * 0.7);
        const t = this.add.text(0, 0, '1-9', textStyle(s * 0.3, '#14161c', { strokeThickness: 0 })).setOrigin(0.5);
        return this.add.container(0, 0, [g, t]);
      }
      case ERASER:
        g.fillStyle(0xf28aa0, 1).fillRoundedRect(-r * 0.75, -r * 0.4, r * 1.5, r * 0.8, r * 0.18);
        g.fillStyle(0xf6f1e5, 1).fillRect(-r * 0.75, -r * 0.4, r * 0.55, r * 0.8);
        g.lineStyle(s * 0.05, 0x14161c, 1).strokeRoundedRect(-r * 0.75, -r * 0.4, r * 1.5, r * 0.8, r * 0.18);
        g.setRotation(-0.5);
        return g;
      case PAN: {
        // An open hand: every part filled in ink slightly larger first, then in skin, so only the outline shows.
        const parts: [number, number, number, number, number][] = [
          [-0.5, -0.15, 0.92, 0.8, 0.24], // palm
          [-0.47, -0.58, 0.2, 0.72, 0.1], // fingers
          [-0.23, -0.76, 0.2, 0.9, 0.1],
          [0.01, -0.7, 0.2, 0.84, 0.1],
          [0.25, -0.52, 0.18, 0.66, 0.09],
          [-0.78, -0.02, 0.4, 0.2, 0.1], // thumb
        ];
        const t = 0.07;
        for (const [color, grow] of [
          [0x14161c, t],
          [0xf6f1e5, 0],
        ] as const) {
          g.fillStyle(color, 1);
          for (const [x, y, w, h, rad] of parts) g.fillRoundedRect((x - grow) * r, (y - grow) * r, (w + grow * 2) * r, (h + grow * 2) * r, (rad + grow) * r);
        }
        return g;
      }
      default:
        g.fillStyle(0x555555, 1).fillRect(-r, -r, s, s);
        return g;
    }
  }

  /** Scales a palette icon so its longer side is `size`. */
  private fitIcon(img: Phaser.GameObjects.Image, size: number): Phaser.GameObjects.Image {
    return img.setScale(size / Math.max(img.width, img.height));
  }

  private refreshPalette() {
    const u = this.u;
    for (const item of this.palItems) {
      const on = item.tool.id === this.toolId || (item.tool.id === TURN_VAN && this.vanRotated);
      const { width: w, height: h } = item.rect;
      item.bg.clear();
      item.bg.fillStyle(on ? 0x3a2b1f : 0x1f2430, 1).fillRoundedRect(0, 0, w, h, 8 * u);
      item.bg.lineStyle(on ? 3 * u : 1.5 * u, on ? 0xe8914a : 0x2f3645, 1).strokeRoundedRect(0, 0, w, h, 8 * u);
    }
    for (const img of this.vanIcons) {
      const key = this.vanRotated ? 'van_tall' : 'van';
      if (img.texture.key !== key) this.fitIcon(img.setTexture(key), img.getData('size') as number);
    }
  }

  private setPalScroll(v: number) {
    this.palScroll = Phaser.Math.Clamp(v, 0, this.palMax);
    if (this.palVertical) this.palCam.setScroll(0, this.palScroll);
    else this.palCam.setScroll(this.palScroll, 0);
    // A thin scrollbar so it's obvious there is more palette.
    const g = this.palBar.clear();
    if (this.palMax <= 0) return;
    const r = this.palRect;
    const t = 4 * this.u;
    if (this.palVertical) {
      const len = (r.height * r.height) / (r.height + this.palMax);
      const y = r.y + (this.palScroll / this.palMax) * (r.height - len);
      g.fillStyle(0xe8914a, 0.7).fillRoundedRect(r.right - t - 1, y, t, len, t / 2);
    } else {
      const len = (r.width * r.width) / (r.width + this.palMax);
      const x = r.x + (this.palScroll / this.palMax) * (r.width - len);
      g.fillStyle(0xe8914a, 0.7).fillRoundedRect(x, r.bottom - t - 1, len, t, t / 2);
    }
  }

  private selectTool(id: string) {
    if (id === TURN_VAN) {
      this.vanRotated = !this.vanRotated;
      this.toolId = VAN;
      this.toast(this.vanRotated ? 'Van: 2 wide, 4 tall' : 'Van: 4 wide, 2 tall');
    } else {
      this.toolId = id;
    }
    sfx.click();
    this.refreshPalette();
    this.drawCursor();
    this.updateInfo();
  }

  private renderProblems() {
    // The UI belongs to the current run of the scene; the fields may still point at the last run's objects.
    if (!this.uiRoot) return;
    const u = this.u;
    const pad = 10 * u;
    const { errors, warnings } = this.report;
    const lines = errors.length ? errors : warnings.map((w) => `Note: ${w}`);
    const base = this.portrait ? 2 : 4;
    const open = this.problemsOpen;
    const bodyOf = (n: number) => {
      let body = lines
        .slice(0, n)
        .map((l) => `• ${l}`)
        .join('\n');
      if (lines.length > n) body += `\n+${lines.length - n} more (tap to ${open ? 'show fewer' : 'see them'})`;
      else if (open && lines.length > base) body += '\n(tap to show fewer)';
      return body;
    };
    const title = errors.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before you can play` : 'Ready to play';
    this.probTitle.setText(title).setColor(errors.length ? COLORS.bad : COLORS.good);
    this.probBody.setColor(errors.length ? COLORS.text : COLORS.warn);
    const heightOf = (body: string) => pad * 2 + this.probTitle.height + (body ? 4 * u + this.probBody.setText(body).height : 0);
    // The panel never hides most of the map (short landscape phones): about a third of it
    // collapsed, 60% opened. Whatever doesn't fit is counted in "+N more".
    const maxH = this.mapRect.height * (open ? 0.6 : 0.34);
    let n = Math.min(lines.length, open ? 10 : base);
    let body = bodyOf(n);
    let h = heightOf(body);
    while (n > 1 && h > maxH) {
      body = bodyOf(--n);
      h = heightOf(body);
    }
    this.probBody.setText(body).setVisible(body.length > 0);
    const { x, w, bottom } = this.probArea;
    const y = bottom - h;
    this.probRect.setTo(x, y, w, h);
    this.probTitle.setPosition(x + pad, y + pad);
    this.probBody.setPosition(x + pad, y + pad + this.probTitle.height + 4 * u);
    const g = this.probGfx.clear();
    g.fillStyle(PANEL, 0.9).fillRoundedRect(x, y, w, h, 10 * u);
    g.lineStyle(2 * u, errors.length ? 0xff5a4f : 0x7ddc7d, 0.9).strokeRoundedRect(x, y, w, h, 10 * u);
    if (!errors.length && this.toastIsProblem) {
      this.toastText?.destroy();
      this.toastText = null;
    }
    this.placeToast();
    this.playBtn.setEnabled(errors.length === 0);
  }

  private updateInfo() {
    if (!this.uiRoot) return;
    const c = this.hoverCell;
    const at = c ? describeCell(this.parsed, c.x, c.y) : '';
    const t = this.tool;
    const how = t.id === PAN ? 'drag to move the map' : isDragTool(t.id) ? 'drag to paint' : this.touch ? 'tap to place, drag to move' : 'click to place';
    const h = this.hoverTool;
    const letter = h && (h.id.length === 1 ? h.id : h.id === ROUTE_STOP ? '1-9' : '');
    const text = h ? `${h.name}${letter ? `  (written as ${letter} in the map text)` : ''}` : at || `${t.id === VAN ? `Van (${this.vanRotated ? '2x4' : '4x2'})` : t.name}: ${how}`;
    this.infoText.setText(text).setScale(1);
    const room = this.saveText.x - this.saveText.width - 12 * this.u - this.infoText.x;
    if (this.infoText.width > room) this.infoText.setScale(Math.max(0.5, room / this.infoText.width));
  }

  // ---- view (map camera) ---------------------------------------------------

  private screenToWorld(sx: number, sy: number) {
    const c = this.mapCam;
    return { x: (sx - c.x - c.width / 2) / c.zoom + c.scrollX + c.width / 2, y: (sy - c.y - c.height / 2) / c.zoom + c.scrollY + c.height / 2 };
  }

  private cellAt(sx: number, sy: number): TilePoint {
    const w = this.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / TILE), y: Math.floor(w.y / TILE) };
  }

  /** The part of the map view not covered by the problems panel. */
  private clearHeight() {
    const c = this.mapCam;
    const covered = this.probRect.height > 0 ? c.y + c.height - this.probRect.y + 8 * this.u : 0;
    return Math.max(c.height * 0.5, c.height - covered);
  }

  private fitZoom() {
    const c = this.mapCam;
    return Math.min(c.width / (this.parsed.width * TILE + TILE * 2), this.clearHeight() / (this.parsed.height * TILE + TILE * 2));
  }

  /** Zooms to `zoom` with world point (wx, wy) shown at screen point (sx, sy). */
  private setView(zoom: number, wx: number, wy: number, sx?: number, sy?: number) {
    const c = this.mapCam;
    const fit = this.fitZoom();
    const z = Phaser.Math.Clamp(zoom, fit * 0.5, Math.max(fit * 2, 3 * this.u));
    sx ??= c.x + c.width / 2;
    sy ??= c.y + c.height / 2;
    c.setZoom(z);
    c.scrollX = wx - c.width / 2 - (sx - c.x - c.width / 2) / z;
    c.scrollY = wy - c.height / 2 - (sy - c.y - c.height / 2) / z;
    this.scrollBy(0, 0);
  }

  private scrollBy(dx: number, dy: number) {
    const c = this.mapCam;
    // Keep the middle of the view over the map so it can't get lost.
    c.scrollX = Phaser.Math.Clamp(c.scrollX + dx, -c.width / 2, this.parsed.width * TILE - c.width / 2);
    c.scrollY = Phaser.Math.Clamp(c.scrollY + dy, -c.height / 2, this.parsed.height * TILE - c.height / 2);
    if (dx || dy) this.fitted = false;
    if (c.zoom !== this.gridZoom) this.drawGrid();
  }

  private fitView() {
    const c = this.mapCam;
    this.setView(this.fitZoom(), (this.parsed.width * TILE) / 2, (this.parsed.height * TILE) / 2, c.x + c.width / 2, c.y + this.clearHeight() / 2);
    this.fitted = true;
  }

  private zoomBy(factor: number, sx?: number, sy?: number) {
    const c = this.mapCam;
    sx ??= c.x + c.width / 2;
    sy ??= c.y + c.height / 2;
    const w = this.screenToWorld(sx, sy);
    this.setView(c.zoom * factor, w.x, w.y, sx, sy);
    this.fitted = false;
  }

  /** Grid lines and ruler numbers stay the same size on screen at any zoom. */
  private drawGrid() {
    const z = (this.gridZoom = this.mapCam.zoom);
    const { width, height } = this.parsed;
    const g = this.gridGfx.clear();
    const px = 1 / z;
    for (let x = 0; x <= width; x++) {
      g.lineStyle(px * (x % 5 ? 1 : 1.5), 0xffffff, x % 5 ? 0.1 : 0.22).lineBetween(x * TILE, 0, x * TILE, height * TILE);
    }
    for (let y = 0; y <= height; y++) {
      g.lineStyle(px * (y % 5 ? 1 : 1.5), 0xffffff, y % 5 ? 0.1 : 0.22).lineBetween(0, y * TILE, width * TILE, y * TILE);
    }
    g.lineStyle(px * 3, 0xe8914a, 0.8).strokeRect(0, 0, width * TILE, height * TILE);
    const scale = this.labelScale(40);
    for (const r of this.rulers) r.setScale(scale);
    for (const t of this.nameTags) t.setScale(this.labelScale(NAME_TAG_PX, NAME_TAG_MAX_SCALE));
    this.drawCursor();
  }

  /** Outline of what the current tool would change under the pointer. */
  private drawCursor() {
    const g = this.cursorGfx?.clear();
    const c = this.hoverCell;
    if (!g || !c || !this.parsed) return;
    const t = this.toolId;
    if (t === PAN) return;
    const line = 3 / this.mapCam.zoom;
    const color = t === ERASER ? 0xff5a4f : 0xffffff;
    let r = { x: c.x, y: c.y, w: 1, h: 1 };
    if (t === VAN) {
      const v = vanRect(this.rows, c.x, c.y, this.vanRotated);
      if (!v || c.x < 0 || c.y < 0 || c.x >= this.parsed.width || c.y >= this.parsed.height) return;
      r = v;
    } else if (isBlockTool(t)) {
      // Big decorations (cars) are stamped with the tapped tile at their top-left, pushed inside the map.
      const { w, h } = DECOR[DECOR_CHARS[t]];
      r = { x: Phaser.Math.Clamp(c.x, 0, this.parsed.width - w), y: Phaser.Math.Clamp(c.y, 0, this.parsed.height - h), w, h };
    }
    g.fillStyle(color, 0.12).fillRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
    g.lineStyle(line, color, 0.9).strokeRect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE);
  }

  // ---- pointer input ---------------------------------------------------------

  private buttonAt(x: number, y: number): UiButton | null {
    return this.buttons.find((b) => b.root.visible && b.rect.contains(x, y)) ?? null;
  }

  private regionAt(x: number, y: number): 'button' | 'problems' | 'ui' | 'palette' | 'map' {
    if (this.buttonAt(x, y)) return 'button';
    if (this.probRect.contains(x, y)) return 'problems';
    if (this.topRect.contains(x, y)) return 'ui';
    if (this.palRect.contains(x, y)) return 'palette';
    if (this.mapRect.contains(x, y)) return 'map';
    return 'ui';
  }

  private onDown(p: Pointer) {
    unlockAudio();
    if (this.overlay) return;
    if (p.wasTouch && !this.touch) {
      this.touch = true;
      this.layout();
    }
    const region = this.regionAt(p.x, p.y);
    if (!p.wasTouch) {
      // One mouse gesture at a time: another button pressed mid-drag is ignored, unless the first
      // button's release was lost (it happened while the window was in the background).
      if (this.mouse) {
        if (this.mouseHeld(p, this.mouse.button)) return;
        this.dropMouseGesture();
      }
      // Right and middle drags only pan the map: they never press buttons or pick tools.
      if (p.button !== 0 && region !== 'map') return;
      this.mouse = { id: p.id, button: p.button };
    }
    if (region === 'button') {
      const button = this.buttonAt(p.x, p.y)!;
      this.pressed = { id: p.id, button };
      button.setPressed(true);
      return;
    }
    if (region === 'problems') {
      this.probPress = p.id;
      return;
    }
    if (region === 'palette') {
      const along = this.palVertical ? p.y : p.x;
      this.palDrag = { id: p.id, x: p.x, y: p.y, start: this.palScroll, moved: false, last: along, at: p.downTime, vel: 0 };
      this.palFling = 0;
      return;
    }
    if (region !== 'map') return;

    if (p.wasTouch) {
      this.touches.set(p.id, { x: p.x, y: p.y });
      if (this.touches.size >= 2) {
        this.startPinch();
        return;
      }
      if (this.touchLock) return;
    }
    this.setHover(this.cellAt(p.x, p.y));
    if (!p.wasTouch && (p.button === 1 || p.button === 2)) {
      this.panDrag = { id: p.id, x: p.x, y: p.y };
    } else if (this.toolId === PAN) {
      this.panDrag = { id: p.id, x: p.x, y: p.y };
    } else if (isDragTool(this.toolId)) {
      this.disarmReset();
      this.finishStroke();
      this.stroke = { id: p.id, before: this.snapshot(), last: null };
      this.paintTo(p);
    } else {
      this.tap = { id: p.id, x: p.x, y: p.y };
    }
    this.updateCursorStyle(p);
  }

  private onMove(p: Pointer) {
    if (this.overlay) return;
    // The button was let go where we couldn't see it: end the drag instead of painting on hover.
    if (!p.wasTouch && this.mouse && !this.mouseHeld(p, this.mouse.button)) this.dropMouseGesture();
    if (this.touches.has(p.id)) this.touches.set(p.id, { x: p.x, y: p.y });
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    if (this.pressed?.id === p.id) this.pressed.button.setPressed(this.pressed.button.rect.contains(p.x, p.y));
    const drag = this.palDrag;
    if (drag?.id === p.id) {
      const delta = this.palVertical ? p.y - drag.y : p.x - drag.x;
      if (!drag.moved && Math.abs(delta) > 10 * this.u) drag.moved = true;
      if (drag.moved) this.setPalScroll(drag.start - delta);
      // Track the finger's speed (by event time, so a slow frame doesn't skew it) so a flick keeps scrolling.
      const along = this.palVertical ? p.y : p.x;
      const now = p.moveTime;
      if (now > drag.at) drag.vel = 0.6 * ((along - drag.last) / (now - drag.at)) + 0.4 * drag.vel;
      drag.last = along;
      drag.at = now;
      return;
    }
    if (this.stroke?.id === p.id) this.paintTo(p);
    if (this.tap?.id === p.id && Math.hypot(p.x - this.tap.x, p.y - this.tap.y) > (this.touch ? 14 : 8) * this.u) {
      // A drag with a "place" tool moves the map instead.
      this.panDrag = { id: p.id, x: this.tap.x, y: this.tap.y };
      this.tap = null;
    }
    if (this.panDrag?.id === p.id) {
      const z = this.mapCam.zoom;
      this.scrollBy(-(p.x - this.panDrag.x) / z, -(p.y - this.panDrag.y) / z);
      this.panDrag.x = p.x;
      this.panDrag.y = p.y;
    }
    // Hover feedback (mouse) and "what's under my finger" (touch).
    if (!p.wasTouch || this.stroke?.id === p.id) {
      const region = this.regionAt(p.x, p.y);
      this.setHover(region === 'map' || this.stroke ? this.cellAt(p.x, p.y) : null);
      const tool = region === 'palette' && !p.wasTouch ? this.paletteItemAt(p.x, p.y)?.tool ?? null : null;
      if (tool !== this.hoverTool) {
        this.hoverTool = tool;
        this.updateInfo();
      }
      const b = region === 'button' && !p.isDown ? this.buttonAt(p.x, p.y) : null;
      if (b !== this.hoverBtn) {
        this.hoverBtn?.setHover(false);
        b?.setHover(true);
        this.hoverBtn = b;
      }
      this.updateCursorStyle(p);
    }
  }

  private onUp(p: Pointer) {
    if (!p.wasTouch) {
      // Letting go of a second button mid-drag doesn't end the drag.
      if (this.mouse && p.button !== this.mouse.button) return;
      this.mouse = null;
    }
    this.touches.delete(p.id);
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
      this.touchLock = this.touches.size > 0;
    }
    if (this.touches.size === 0) this.touchLock = false;
    if (this.overlay) return;

    const pressed = this.pressed;
    if (pressed?.id === p.id) {
      this.pressed = null;
      pressed.button.setPressed(false);
      // Clicks run inside the browser's pointer event, which the clipboard needs.
      if (pressed.button.rect.contains(p.x, p.y)) {
        sfx.click();
        pressed.button.onClick();
      }
    }
    if (this.probPress === p.id) {
      this.probPress = null;
      if (this.probRect.contains(p.x, p.y)) {
        this.problemsOpen = !this.problemsOpen;
        this.renderProblems();
      }
    }
    const drag = this.palDrag;
    if (drag?.id === p.id) {
      this.palDrag = null;
      if (drag.moved && p.upTime - drag.at < 120) this.palFling = -drag.vel;
      if (!drag.moved) {
        const item = this.paletteItemAt(p.x, p.y);
        if (item) this.selectTool(item.tool.id);
      }
    }
    if (this.stroke?.id === p.id) this.finishStroke();
    if (this.tap?.id === p.id) {
      const cell = this.cellAt(this.tap.x, this.tap.y);
      this.tap = null;
      this.place(cell);
    }
    if (this.panDrag?.id === p.id) this.panDrag = null;
    if (p.wasTouch) this.updateInfo();
    this.updateCursorStyle(p);
  }

  /** Is `button` still held, going by the mouse event (browsers without `buttons` count as held)? */
  private mouseHeld(p: Pointer, button: number): boolean {
    const buttons = (p.event as MouseEvent | null)?.buttons;
    return typeof buttons !== 'number' || (buttons & (MOUSE_BITS[button] ?? 0)) !== 0;
  }

  /** Ends the mouse's gesture without clicking, tapping or picking anything (a stroke keeps its paint as one undo step). */
  private dropMouseGesture() {
    const id = this.mouse?.id;
    this.mouse = null;
    if (id === undefined) return;
    if (this.stroke?.id === id) this.finishStroke();
    if (this.panDrag?.id === id) this.panDrag = null;
    if (this.tap?.id === id) this.tap = null;
    if (this.palDrag?.id === id) this.palDrag = null;
    if (this.probPress === id) this.probPress = null;
    if (this.pressed?.id === id) {
      this.pressed.button.setPressed(false);
      this.pressed = null;
    }
  }

  private paletteItemAt(x: number, y: number): PaletteItem | null {
    const px = x - this.palRect.x + this.palCam.scrollX;
    const py = y - this.palRect.y + this.palCam.scrollY;
    return this.palItems.find((i) => i.rect.contains(px, py)) ?? null;
  }

  private onWheel(p: Pointer, _over: unknown, dx: number, dy: number) {
    if (this.overlay) return;
    const region = this.regionAt(p.x, p.y);
    if (region === 'palette') {
      const d = this.palVertical || Math.abs(dy) > Math.abs(dx) ? dy : dx;
      this.setPalScroll(this.palScroll + d * this.u);
    } else if (region === 'map') {
      this.zoomBy(Math.exp(-Phaser.Math.Clamp(dy, -300, 300) * 0.0015), p.x, p.y);
    }
  }

  private onGameOut() {
    if (this.stroke) return;
    this.hoverTool = null;
    this.setHover(null);
    this.hoverBtn?.setHover(false);
    this.hoverBtn = null;
  }

  private setHover(cell: TilePoint | null) {
    const inside = cell && cell.x >= 0 && cell.y >= 0 && cell.x < this.parsed.width && cell.y < this.parsed.height;
    const next = inside ? cell : null;
    if (next?.x === this.hoverCell?.x && next?.y === this.hoverCell?.y) return;
    this.hoverCell = next;
    this.drawCursor();
    this.updateInfo();
  }

  private updateCursorStyle(p: Pointer) {
    const region = this.regionAt(p.x, p.y);
    let style = 'default';
    if (region === 'button' || region === 'problems' || region === 'palette') style = 'pointer';
    else if (region === 'map') {
      if (this.panDrag) style = 'grabbing';
      else if (this.toolId === PAN) style = 'grab';
      else style = 'crosshair';
    }
    if (style !== this.cursorStyle) {
      this.cursorStyle = style;
      this.input.setDefaultCursor(style);
    }
  }

  // ---- touch gestures ----------------------------------------------------------

  private startPinch() {
    // Whatever the first finger started (a stroke, a tap) was really the start of a pinch.
    if (this.stroke) {
      this.restore(this.stroke.before);
      this.stroke = null;
    }
    this.tap = null;
    this.panDrag = null;
    const [a, b] = [...this.touches.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.mapCam.zoom, world: this.screenToWorld(mid.x, mid.y) };
  }

  private updatePinch() {
    const pinch = this.pinch!;
    const [a, b] = [...this.touches.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    // Zoom by the finger spread and keep the point between the fingers under them (two-finger pan).
    this.setView((pinch.zoom * dist) / pinch.dist, pinch.world.x, pinch.world.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    this.fitted = false;
  }

  // ---- editing -------------------------------------------------------------------

  private paintTo(p: Pointer) {
    const stroke = this.stroke!;
    // Same rule as taps: nothing is painted under the problems panel, the zoom buttons or the bars.
    if (this.regionAt(p.x, p.y) !== 'map') {
      stroke.last = null;
      return;
    }
    const cell = this.cellAt(p.x, p.y);
    const cells = stroke.last ? lineCells(stroke.last.x, stroke.last.y, cell.x, cell.y).slice(1) : [cell];
    stroke.last = cell;
    let rows = this.rows;
    for (const c of cells) {
      const r = paint(rows, c.x, c.y, this.toolId, { vanRotated: this.vanRotated });
      if (r.changed) rows = r.rows;
    }
    if (rows !== this.rows) {
      this.rows = rows;
      this.changed();
    }
  }

  /** One drag stroke = one undo step. Room names are settled once, for the whole stroke. */
  private finishStroke() {
    const stroke = this.stroke;
    if (!stroke) return;
    this.stroke = null;
    this.dirty = true;
    if (!stroke.before.rows.some((r, i) => r !== this.rows[i])) return;
    this.history.record(stroke.before);
    this.names = this.namesAfter(stroke.before, this.rows);
    this.changed();
  }

  private place(cell: TilePoint) {
    this.disarmReset();
    const r = paint(this.rows, cell.x, cell.y, this.toolId, { vanRotated: this.vanRotated });
    if (r.message) this.toast(r.message, r.changed ? COLORS.text : COLORS.warn);
    if (r.changed) this.commit(r.rows, this.namesAfter(this.snapshot(), r.rows));
  }

  private undo() {
    this.finishStroke();
    this.disarmReset();
    const prev = this.history.undo(this.snapshot());
    if (prev) this.restore(prev);
  }

  private redo() {
    this.finishStroke();
    this.disarmReset();
    const next = this.history.redo(this.snapshot());
    if (next) this.restore(next);
  }

  private onReset() {
    if (!this.resetArmed) {
      // Two taps: the first one only asks.
      this.resetArmed = true;
      this.resetArmedAt = performance.now();
      this.resetBtn.setText('SURE?').setFill(RED);
      this.toast('Tap SURE? to replace your map with the built-in school. UNDO can bring it back.', COLORS.warn, 3500);
      this.resetTimer = this.time.delayedCall(3500, () => this.disarmReset());
      return;
    }
    if (performance.now() - this.resetArmedAt < RESET_CONFIRM_MIN_MS) return;
    this.disarmReset();
    this.finishStroke();
    const map = parseMap(DEFAULT_MAP.text);
    const sizeChanged = map.width !== this.parsed.width || map.height !== this.parsed.height;
    this.base = DEFAULT_MAP.text;
    this.commit(map.rows, map.names);
    if (sizeChanged) this.fitView();
    this.toast('Back to the built-in school. UNDO brings your map back.');
  }

  private disarmReset() {
    this.resetTimer?.remove(false);
    this.resetTimer = null;
    if (!this.resetArmed) return;
    this.resetArmed = false;
    this.resetBtn.setText('RESET').setFill(GREY);
  }

  // ---- buttons ---------------------------------------------------------------------

  private back() {
    this.finishStroke();
    if (this.unsaved) this.saveNow();
    this.scene.start('Menu');
  }

  private play() {
    this.finishStroke();
    if (this.validateTimer || this.dirty) this.runValidation();
    if (this.report.errors.length) {
      this.toast(`Can't play yet: ${this.report.errors[0]}`, COLORS.bad, 3500);
      this.toastIsProblem = true;
      this.problemsOpen = true;
      this.renderProblems();
      return;
    }
    if (this.unsaved) this.saveNow();
    this.scene.start('Game', { character: loadSave().character, mapText: this.mapText() });
  }

  /** Must run inside the click's pointer event: browsers only allow clipboard writes there. */
  private copyMap() {
    const text = this.mapText();
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('no clipboard');
      clipboard.writeText(text).then(
        () => this.alive && this.toast('Map copied. Paste it anywhere to share it.', COLORS.good),
        () => this.alive && this.showCopyOverlay(text),
      );
    } catch {
      this.showCopyOverlay(text);
    }
  }

  /** Fallback when the clipboard is blocked (e.g. inside a sandboxed iframe): select-and-copy by hand. */
  private showCopyOverlay(text: string) {
    this.closeOverlay();
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;gap:10px;padding:16px;box-sizing:border-box;' +
      'background:rgba(11,13,18,0.94);color:#f6f1e5;font:15px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;';
    const msg = document.createElement('div');
    msg.textContent = 'Your map is selected below. Copy it with Ctrl+C (Cmd+C on a Mac), or press and hold, then Copy, on a phone.';
    const area = document.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.spellcheck = false;
    area.setAttribute('aria-label', 'Map text');
    area.style.cssText =
      'flex:1;width:100%;box-sizing:border-box;padding:10px;border:2px solid #e8914a;border-radius:8px;background:#12151c;color:#f6f1e5;' +
      'font:12px/1.25 ui-monospace,Menlo,Consolas,monospace;white-space:pre;overflow:auto;resize:none;' +
      'user-select:text;-webkit-user-select:text;touch-action:auto;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.style.cssText =
      'align-self:center;min-width:160px;min-height:48px;padding:10px 28px;border:2px solid #14161c;border-radius:12px;' +
      'background:#3d4558;color:#f6f1e5;font:700 18px system-ui,sans-serif;cursor:pointer;touch-action:manipulation;';
    close.addEventListener('click', () => this.closeOverlay());
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeOverlay();
    });
    wrap.append(msg, area, close);
    document.body.appendChild(wrap);
    this.overlay = wrap;
    this.input.keyboard?.disableGlobalCapture();
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    try {
      // Still inside (or just after) the click, so the old copy command often works where the clipboard API doesn't.
      if (document.execCommand('copy')) msg.textContent = 'Copied! The map text is also here if you need it.';
    } catch {
      // Selected text is enough.
    }
  }

  private closeOverlay() {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
    this.input.keyboard?.enableGlobalCapture();
  }

  /** Toasts sit just above the problems panel, but never over the toolbar. */
  private placeToast() {
    const t = this.toastText;
    if (!t) return;
    const m = 8 * this.u;
    t.setPosition(this.mapRect.centerX, Math.max(this.probRect.y - m, this.mapRect.y + m + t.displayHeight));
  }

  private toast(text: string, color: string = COLORS.text, ms = 2400) {
    if (!this.uiRoot) return;
    this.toastText?.destroy();
    const u = this.u;
    const t = this.add
      .text(this.mapRect.centerX, this.probRect.y - 8 * u, text, {
        ...textStyle(15 * u, color, { align: 'center', wordWrap: { width: this.mapRect.width * 0.86, useAdvancedWrap: true } }),
        backgroundColor: 'rgba(18,21,28,0.88)',
        padding: { x: 12 * u, y: 8 * u },
      })
      .setOrigin(0.5, 1);
    this.uiRoot.add(t);
    this.toastText = t;
    this.toastIsProblem = false;
    this.placeToast();
    this.toastTimer?.remove(false);
    this.toastTimer = this.time.delayedCall(ms, () => {
      if (this.toastText === t) this.toastText = null;
      t.destroy();
    });
  }

  // ---- keyboard ----------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.overlay || !this.alive || !this.scene.isActive()) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod || e.altKey) return;
    if (e.code.startsWith('Arrow')) e.preventDefault();
    this.held.add(e.code);
    if (e.repeat) return;
    if (key === '+' || key === '=') this.zoomBy(1.4);
    else if (key === '-' || key === '_') this.zoomBy(1 / 1.4);
    else if (key === '0') this.fitView();
    else if (key === 'r') this.selectTool(TURN_VAN);
    else if (key === 'escape') this.disarmReset();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    // A mouse button let go while the window is in the background never reports its mouseup.
    this.dropMouseGesture();
  };

  private onContextMenu = (e: Event) => e.preventDefault();
}
