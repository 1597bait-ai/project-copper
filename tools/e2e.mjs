// End-to-end check in a real (headless) browser. Plays through the core rules, the students, the
// sleepy coworker and the map editor (Copper Studio's Map tab) on a desktop screen; then Copper
// Studio: its settings, play tests and Map tab, a save round trip through the game page as
// claude.ai publishes it, and the Studio on a phone; then the touch controls on phones held
// sideways and upright. Saves screenshots to .smoke/.
//
//   npm run build && npm run build:single && npm run e2e
//   E2E_URL=http://localhost:5173 npm run e2e     (against a running dev server instead)
//   E2E_ONLY=students,studio npm run e2e          (just some parts: desktop, students, coworker, editor, studio, phone, portrait)
//
// Uses debug access via window.__COPPER__ to teleport people around. Every position comes from the
// map and the world at runtime (fixtures by type, open hallway stretches, reachable tiles), and the
// tuning numbers from window.__COPPER__.balance, so the checks keep working when the map or
// src/config/balance.ts is edited. The Studio checks take their settings from src/config/schema.ts.

import { chromium, devices } from 'playwright';
import { createServer, preview } from 'vite';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildArtifactPage } from './artifact-page.mjs';
import { buildPageContent, parsePage, wrapInHost } from '../src/studio/page.ts';

const OUT = '.smoke';
const T = 64;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
await mkdir(OUT, { recursive: true });
const server = process.env.E2E_URL ? null : await preview({ preview: { port: 4317 }, logLevel: 'silent' });
const url = process.env.E2E_URL ?? server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
/** E2E_ONLY=students,editor runs just those parts (handy while working on one). */
const only = process.env.E2E_ONLY?.split(',');
const runs = (part) => !only || only.includes(part);

const check = (label, cond, info) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(info ?? ''));
  if (!cond) failed++;
};

/**
 * Helpers available to every snippet run in the page (g = Game scene). Tiles are {x, y} in map cells.
 */
const LIB = String.raw`
const T = 64;
const B = window.__COPPER__.balance;
/** The rules that turn stats into numbers (src/config/balance.ts). */
const R = window.__COPPER__.rules;
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const key = (t) => t.x + ',' + t.y;
const center = (t) => ({ x: (t.x + 0.5) * T, y: (t.y + 0.5) * T });
const tileOf = (p) => ({ x: Math.floor(p.x / T), y: Math.floor(p.y / T) });
const walkable = (x, y) => !g.world.nav.blocked(x, y);
const clearTile = (x, y) => walkable(x, y) && !g.world.sight.blocked(x, y);
const kindAt = (x, y) => g.world.roomKindAt((x + 0.5) * T, (y + 0.5) * T);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Teleports a body to the middle of tile t (the camera jumps along when it's Dalton, for the screenshots). */
function put(body, t) {
  body.reset((t.x + 0.5) * T, (t.y + 0.5) * T);
  if (body === g.player.body) g.cameras.main.centerOn((t.x + 0.5) * T, (t.y + 0.5) * T);
}
/** Points the camera at someone else for a screenshot; lookAt(g.player) follows Dalton again. */
function lookAt(who) {
  const cam = g.cameras.main;
  cam.stopFollow();
  cam.centerOn(who.x, who.y);
  if (who === g.player) cam.startFollow(g.player.zone, true, 0.12, 0.12);
}
const spawnTile = () => tileOf(g.world.playerSpawn);
/** Steps to every tile that can be walked to from t (locked doors as they are now). */
function steps(t) {
  const d = new Map([[key(t), 0]]);
  const queue = [t];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!walkable(n.x, n.y) || d.has(key(n))) continue;
      d.set(key(n), d.get(key(c)) + 1);
      queue.push(n);
    }
  }
  return d;
}
/** Ready fixtures within reach of someone standing in the middle of tile t. */
const inReach = (t) => g.world.fixtures.filter((f) => f.ready && dist(f, center(t)) < B.interactRangeTiles * T);
const doorInReach = (t) => g.world.doors.some((d) => d.locked && Math.hypot(Math.max(d.rect.left - center(t).x, 0, center(t).x - d.rect.right), Math.max(d.rect.top - center(t).y, 0, center(t).y - d.rect.bottom)) < B.interactRangeTiles * T);
/** A tile beside fixture f (reachable per 'from') where f is the only thing in reach. */
function spotBy(f, from) {
  const ft = tileOf(f);
  return [[0, 0], ...DIRS]
    .map(([dx, dy]) => ({ x: ft.x + dx, y: ft.y + dy }))
    .find((t) => from.has(key(t)) && !doorInReach(t) && inReach(t).length === 1 && inReach(t)[0] === f) ?? null;
}
/**
 * Teleports Dalton beside the fixture of this id nearest the player start that he can walk to (and
 * that nothing else is in reach of). Returns that fixture's tile.
 */
function standBy(id) {
  const from = steps(spawnTile());
  const options = g.world.fixtures
    .filter((f) => f.def.id === id && f.ready)
    .map((f) => ({ f, t: spotBy(f, from) }))
    .filter((o) => o.t)
    .sort((a, b) => from.get(key(a.t)) - from.get(key(b.t)));
  if (!options.length) throw new Error('No reachable ' + id);
  put(g.player.body, options[0].t);
  return { ...tileOf(options[0].f), label: options[0].f.label };
}
/**
 * The first stretch of n hallway tiles in a row (top-left first) that is open to walk and see along,
 * with open tiles above and below, and that can be walked to from the player start.
 */
function openRow(n) {
  const from = steps(spawnTile());
  const { width, height } = g.world.map;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x + n < width; x++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        ok = kindAt(x + i, y) === 'hallway' && from.has(key({ x: x + i, y }));
        for (let dy = -1; dy <= 1 && ok; dy++) ok = clearTile(x + i, y + dy);
      }
      if (ok) return { x, y };
    }
  }
  throw new Error('No open hallway row of ' + n);
}
/** Mr. Gravy stands at tile t looking 'facing' (radians) until told otherwise, ready to catch and take reports. */
function parkBoss(t, facing = 0) {
  const b = g.boss;
  Object.assign(b, { grace: 0, state: 'pause', timer: 9999, lookBase: facing, lookT: 0, facing, suspicion: 0, path: [] });
  put(b.body, t);
}
/** Mr. Gravy stops catching (and taking reports) and students stop noticing, for checks about something else. */
function calm() {
  g.boss.grace = 9999;
  for (const s of g.students) s.ignore = 9999;
}
/** Every texture in use, and anything turned at an angle (the pixel art always faces the camera). */
function sceneObjects(scene) {
  const out = [];
  const walk = (list) => list.forEach((o) => (out.push(o), o.list && walk(o.list)));
  walk(scene.children.list);
  return out;
}
/** The map editor (ed): where the middle of map cell t is on the screen, in game pixels. */
function edScreen(t) {
  const c = ed.mapCam;
  return { x: c.x + ((t.x + 0.5) * T - c.worldView.x) * c.zoom, y: c.y + ((t.y + 0.5) * T - c.worldView.y) * c.zoom };
}
/** Whether a click on cell t paints it (it isn't under the problems panel, the toolbar or the palette). */
function edClickable(t) {
  const p = edScreen(t);
  return ed.regionAt(p.x, p.y) === 'map';
}
/** The first hallway cell (top-left first) with hallway all around that a click can paint. */
function edOpenHall() {
  const at = (x, y) => ed.rows[y]?.[x];
  const open = (x, y) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => at(x + dx, y + dy) === '.'));
  for (let y = 0; y < ed.rows.length; y++) for (let x = 0; x < ed.rows[y].length; x++) if (open(x, y) && edClickable({ x, y })) return { x, y };
  return null;
}
`;

/**
 * Waits for the game to start and keeps its clock running: headless windows never have focus, and
 * Phaser slows the clock down for unfocused windows. Again after every reload.
 */
async function booted(page) {
  await page.waitForFunction(() => window.__COPPER__?.game, null, { timeout: 60000 });
  await page.evaluate(() => {
    const loop = window.__COPPER__.game.loop;
    setInterval(() => {
      loop.inFocus = true;
      loop._coolDown = 0;
    }, 50);
  });
}

/** What open() waits for: the game's menu, or Copper Studio (opened by #studio in the address). */
const READY = {
  menu: () => window.__COPPER__.game.scene.isActive('Menu'),
  studio: () => window.__COPPER__.studio?.isOpen && document.querySelector('.cs-search') !== null,
};

/**
 * Opens the game in a fresh browser (no stored draft or progress). `target` is the page to load
 * (the preview build by default) and `setup(context)` runs before it does (routes, a stand-in for
 * claude.ai).
 */
async function open(name, contextOptions, { target = url, setup = null, ready = 'menu' } = {}) {
  // This part's screenshots from earlier runs (so .smoke/ never shows a stale picture).
  for (const f of await readdir(OUT)) if (f.startsWith(`${name}-`)) await rm(`${OUT}/${f}`);
  const context = await browser.newContext(contextOptions);
  if (setup) await setup(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(target);
  await booted(page);
  await page.waitForFunction(READY[ready], null, { timeout: 60000 });

  /** Run code with g = Game scene, h = Hud scene, gm = Phaser.Game, ed = Editor scene, and the LIB helpers. */
  const G = (src) =>
    page.evaluate(
      ([lib, src]) => {
        const gm = window.__COPPER__.game;
        const s = (k) => gm.scene.getScene(k);
        return new Function('g', 'h', 'gm', 'ed', `${lib}\n${src}`)(s('Game'), s('Hud'), gm, s('Editor'));
      },
      [LIB, src],
    );

  /** Wait until `cond` (an expression using g, h, B = balance and T) holds, or `max` seconds of in-game time pass. Returns whether it held. */
  const waitFor = async (cond, max = 120) => {
    const e0 = await G('return g.elapsed;');
    const handle = await page.waitForFunction(
      ([e0, max, cond]) => {
        const gm = window.__COPPER__.game;
        const g = gm.scene.getScene('Game');
        if (!g.sys.isActive()) return 'stopped';
        if (new Function('g', 'h', 'B', 'T', `return (${cond});`)(g, gm.scene.getScene('Hud'), window.__COPPER__.balance, 64)) return 'met';
        return g.elapsed - e0 >= max ? 'timeout' : false;
      },
      [e0, max, cond],
      { timeout: 300000, polling: 30 },
    );
    return (await handle.jsonValue()) === 'met';
  };
  /** Wait for N seconds of in-game time (the game clock, not wall time; headless rendering is slow). */
  const wait = (seconds) => waitFor('false', seconds);

  /**
   * Records `expr` (using g) after every game frame, until stopTrace() returns the list. Catches
   * things that happen between two polls, like a yell on the very first frame.
   */
  const trace = (expr) =>
    G(`window.__trace = []; window.__traceFn = () => window.__trace.push(${expr}); g.events.on('postupdate', window.__traceFn);`);
  const stopTrace = () => G(`g.events.off('postupdate', window.__traceFn); return window.__trace;`);

  /** Toasts the game shows from now on (window.__toasts). */
  const watchToasts = () => G(`window.__toasts = []; g.events.on('toast', (t) => window.__toasts.push(t));`);

  const tap = async (key) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
  };
  /** Screenshot once the camera fades are over (headless phones render slowly). */
  const shot = async (file) => {
    await page
      .waitForFunction(() => window.__COPPER__.game.scene.getScenes(true).every((s) => !s.cameras.main.fadeEffect.isRunning), null, { timeout: 15000 })
      .catch(() => undefined);
    await page.screenshot({ path: `${OUT}/${name}-${file}.png` });
  };
  const sceneActive = (key) => page.waitForFunction((k) => window.__COPPER__.game.scene.isActive(k), key, { timeout: 30000 });

  /** Screen position (CSS px) of a world point seen through a scene's camera. */
  const toScreen = (sceneKey, wx, wy, cam = 'main') =>
    page.evaluate(
      ([sceneKey, wx, wy, cam]) => {
        const gm = window.__COPPER__.game;
        const c = cam === 'main' ? gm.scene.getScene(sceneKey).cameras.main : gm.scene.getScene(sceneKey)[cam];
        const r = gm.canvas.getBoundingClientRect();
        const k = r.width / gm.scale.width;
        return { x: r.left + (c.x + (wx - c.worldView.x) * c.zoom) * k, y: r.top + (c.y + (wy - c.worldView.y) * c.zoom) * k };
      },
      [sceneKey, wx, wy, cam],
    );
  /** Screen position of a HUD point (the HUD camera doesn't scroll or zoom). */
  const hudToScreen = (x, y) =>
    page.evaluate(
      ([x, y]) => {
        const gm = window.__COPPER__.game;
        const r = gm.canvas.getBoundingClientRect();
        const k = r.width / gm.scale.width;
        return { x: r.left + x * k, y: r.top + y * k };
      },
      [x, y],
    );
  /** Screen position of a theme Button (menu / shift end) by its label. */
  const buttonPos = async (sceneKey, label) => {
    const p = await page.evaluate(
      ([sceneKey, label]) => {
        const b = window.__COPPER__.game.scene.getScene(sceneKey).children.list.find((o) => o.label?.text === label);
        return b ? { x: b.x, y: b.y } : null;
      },
      [sceneKey, label],
    );
    return p && toScreen(sceneKey, p.x, p.y);
  };
  const click = async (pos) => {
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
  };
  const shiftLength = () => G('return g.elapsed / g.hud.progress;');
  /** Jumps the clock to just before 3:00 PM and waits for the shift-end screen. */
  const endShift = async () => {
    await G(`g.elapsed = ${await shiftLength()} - 0.2;`);
    await sceneActive('ShiftEnd');
    await page.waitForTimeout(600);
  };

  return { context, page, errors, G, waitFor, wait, trace, stopTrace, watchToasts, tap, shot, sceneActive, toScreen, hudToScreen, buttonPos, click, shiftLength, endShift };
}

// ---- Copper Studio helpers ---------------------------------------------------------------------

/** Modules of the game's own source (what the Studio should show), loaded through Vite like tools/map.mjs does. */
async function loadSource(paths) {
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const modules = [];
    for (const path of paths) modules.push(await vite.ssrLoadModule(path));
    return modules;
  } finally {
    await vite.close();
  }
}

/** The grid of a map's text, row by row: what the map parser reads (no notes, room names or blank lines). */
const gridRows = (text) =>
  text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.trimStart().startsWith('//') && !line.startsWith('@'));

/** Drives Copper Studio the way a person does: with clicks, or with taps on a phone. */
function studioKit(page, { touch = false } = {}) {
  const press = (locator) => (touch ? locator.tap() : locator.click());
  const until = (fn, arg = null, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
  const kit = {
    press,
    until,
    /** Whether `fn` comes true within `timeout` ms. */
    holds: (fn, arg = null, timeout = 20000) => until(fn, arg, timeout).then(
      () => true,
      () => false,
    ),
    snapshot: () => page.evaluate(() => window.__COPPER__.studio.snapshot()),
    /** The header's count of unsaved changes. */
    unsaved: async () => Number(await page.locator('.cs-chip[data-unsaved]').getAttribute('data-unsaved')),
    field: (path) => page.locator(`.cs-field[data-path="${path}"]`),
    /** A setting's markers: "Unsaved · was 2 Undo", "Shipped: 2 Reset". */
    status: (path) => kit.field(path).locator('.cs-status').textContent(),
    /** Presses a setting's Undo or Reset. */
    link: (path, text) => press(kit.field(path).locator('.cs-status .cs-link', { hasText: text })),
    /** Opens a tab: a section's id, 'map' or 'history'. */
    tab: async (id) => {
      await press(page.locator(`.cs-tab[data-tab="${id}"]`));
      await until((id) => document.querySelector(`.cs-tab[data-tab="${id}"]`)?.getAttribute('aria-selected') === 'true', id);
    },
    /** Types a number into a setting on the open tab, then leaves the box. */
    type: async (path, value) => {
      const input = kit.field(path).locator('input.cs-num').first();
      if (touch) await input.tap();
      await input.fill(String(value));
      await input.blur();
    },
    /** Picks an item from the header's ⋯ menu. */
    menu: async (item) => {
      await press(page.locator('.cs-menuwrap .cs-btn'));
      await press(page.locator('.cs-menu button', { hasText: item }));
    },
  };
  return kit;
}

/** The labels of the menu's buttons. */
const menuButtons = (page) => page.evaluate(() => window.__COPPER__.game.scene.getScene('Menu').children.list.filter((o) => o.label).map((o) => o.label.text));

/** The balance label in a screen's corner ("Balance v3 · 12 Oct 2026", or "Play test · …"), or null. */
const screenLabel = (page, scene = 'Menu') =>
  page.evaluate((scene) => window.__COPPER__.game.scene.getScene(scene).children.list.find((o) => o.type === 'Text' && /^(Balance v|Play test)/.test(o.text))?.text ?? null, scene);

/** The Studio's floating ◀ STUDIO button during a play test: whether it shows, and the HUD windows it covers (none, it should). */
const backButton = (page) =>
  page.evaluate(() => {
    const gm = window.__COPPER__.game;
    const el = document.querySelector('.cs-back');
    if (!el || el.hidden) return { visible: false, hits: [] };
    const b = el.getBoundingClientRect();
    const c = gm.canvas.getBoundingClientRect();
    // The HUD's windows (none on the end screen or the menu).
    const hud = gm.registry.get('hud:layout');
    const k = hud ? c.width / hud.width : 1;
    const hits = (hud?.boxes ?? [])
      .map((x) => ({ left: c.left + x.x * k, top: c.top + x.y * k, right: c.left + (x.x + x.w) * k, bottom: c.top + (x.y + x.h) * k }))
      .filter((x) => b.left < x.right && x.left < b.right && b.top < x.bottom && x.top < b.bottom);
    return { visible: b.width > 0 && b.height > 0, hits, at: [b.left, b.top, b.width, b.height] };
  });

/** How far Copper Studio sticks out sideways on this screen: nothing should (the tab strip scrolls on purpose). */
const sideways = (page) =>
  page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const main = document.querySelector('.cs-main');
    const out = [...document.querySelectorAll('.cs *')].filter((el) => {
      if (el.closest('.cs-tabs')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1);
    });
    return { page: document.documentElement.scrollWidth - W, main: main.scrollWidth - main.clientWidth, out: out.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${el.className}`) };
  });

/** Where the stand-in for claude.ai serves the published game page. */
const PAGE_URL = 'https://copper.test/game';

/**
 * A stand-in for claude.ai, for open()'s `setup`: PAGE_URL serves the newest of `host.versions` (the
 * published page, wrapped in the host's skeleton). `canEdit` true or false gives the page claude.ai's
 * runtime (window.claude) for a viewer who may or may not publish; null is a viewer without it (not
 * signed in). A publish becomes the newest version, and the view reloads a moment later, as on claude.ai.
 */
function hostSetup(host, canEdit) {
  return async (context) => {
    await context.route(PAGE_URL, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host.versions.at(-1) }));
    if (canEdit === null) return;
    await context.exposeBinding('__hostPublish', (_source, html) => {
      host.versions.push(html);
      return { version: `v${host.versions.length}` };
    });
    await context.addInitScript((canEdit) => {
      const caps = {
        artifact: Object.freeze({
          publish: async (html) => {
            if (!canEdit) throw Object.assign(new Error('Only the owner or an editor can publish.'), { code: 'not_writer' });
            const result = await window.__hostPublish(html);
            setTimeout(() => location.reload(), 300);
            return result;
          },
        }),
        user: Object.freeze({ canEdit: async () => canEdit }),
        downloads: Object.freeze({ save: async () => ({ status: 'saved' }) }),
      };
      window.claude = Object.freeze({ use: async (name) => caps[name] ?? null });
    }, canEdit);
  };
}

// ---- desktop: menu, crew select and the rules ------------------------------------------------
if (runs('desktop')) {
  const { context, page, errors, G, waitFor, wait, tap, shot, sceneActive, shiftLength, endShift } = await open('desktop', {
    viewport: { width: 1600, height: 900 },
  });
  await page.waitForTimeout(600);
  await shot('menu');
  const menuPick = () => page.evaluate(() => window.__COPPER__.game.scene.getScene('Menu').selected);
  await tap('ArrowRight');
  check('crew select: the arrow keys pick the next card', (await menuPick()) === 'tomothy', await menuPick());
  await tap('ArrowLeft');
  check('...and back', (await menuPick()) === 'dalton', await menuPick());
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.5);
  await shot('start');
  check(
    'the shift starts with Dalton on the built-in map (every student and fixture in it)',
    await G(`return g.player.character.id === 'dalton' && g.students.length > 0 && g.students.length === g.world.map.students.length
             && g.world.fixtures.length === g.world.map.fixtures.length && g.world.decor.length === g.world.map.decor.length;`),
  );
  const art = await G(`const objs = sceneObjects(g);
    return {
      missing: [...new Set(objs.filter((o) => o.texture && (o.texture.key === '__MISSING' || o.texture.key === '__DEFAULT') && o.visible).map((o) => o.type))],
      turned: objs.filter((o) => o.rotation && o.type !== 'Graphics').map((o) => (o.texture?.key ?? o.type) + ':' + o.rotation.toFixed(2)),
      people: [g.player, g.boss, ...g.students].every((p) => gm.textures.exists(p.view.container.list.find((o) => o.texture?.key.endsWith('_sheet'))?.texture.key)),
    };`);
  check('every image has its pixel-art texture', art.missing.length === 0, art.missing);
  check('nothing in the world is turned: people and fixtures face the camera', art.turned.length === 0, art.turned);
  check('people are drawn from their walking sprite sheets', art.people);
  await G('calm();');

  const fountain = await G("return standBy('drinking_fountain');");
  await wait(0.2);
  check('prompt offers the drinking fountain', (await G('return g.hud.prompt;'))?.includes('Drinking Fountain'), await G('return g.hud.prompt;'));
  await tap('e');
  await wait(0.3);
  // Dalton is HVAC; a fountain is plumbing: repair 2 + 0.25 (design board).
  const expected = await G(`const f = g.world.fixtures.find((f) => f.def.id === 'drinking_fountain' && Math.floor(f.x / T) === ${fountain.x} && Math.floor(f.y / T) === ${fountain.y});
    return f.def.workSeconds * B.repair.reference / (g.player.character.stats.repair + B.repair.otherBonus);`);
  check('scrapping takes the fixture time at Dalton\'s repair (2 + 0.25)', Math.abs((await G('return g.player.channel?.duration;')) - expected) < 0.01, expected);
  check('scrapping counts as suspicious', await G('return g.player.suspicious;'));
  await shot('scrapping');
  check('fountain gives 1.0 copper', await waitFor('g.player.bag.total === 1', expected + 1));

  await G(`// The tile beside the van nearest the player start.
    const v = g.world.map.van;
    const from = steps(spawnTile());
    const near = [];
    for (let y = v.y - 1; y <= v.y + v.h; y++) for (let x = v.x - 1; x <= v.x + v.w; x++) if (from.has(key({ x, y })) && g.world.van.reach.contains((x + 0.5) * T, (y + 0.5) * T)) near.push({ x, y });
    near.sort((a, b) => from.get(key(a)) - from.get(key(b)));
    put(g.player.body, near[0]);`);
  await wait(0.3);
  check('van sells 1.0 copper for $10', await G('return g.hud.money === 10 && g.player.bag.isEmpty;'), await G('return g.hud.money;'));

  // Somewhere away from the van for the bag and disguise checks.
  const row = await G('return openRow(6);');
  await G(`put(g.player.body, { x: ${row.x + 5}, y: ${row.y} }); g.player.bag.add('steel', 5);`);
  check('bag stops at capacity 2', await G('return g.player.bag.total === 2 && g.player.bag.isFull;'));
  await tap('q');
  await wait(0.2);
  check('disguise hides carried scrap', await G('return g.player.disguised && !g.player.suspicious;'));
  check('disguise wears off after 5s', await waitFor('!g.player.disguised && g.player.suspicious', 6));

  // Mr. Gravy looking along an open hallway, Dalton 2.5 tiles in front of him with steel in the bag.
  await G(`parkBoss({ x: ${row.x}, y: ${row.y} }, 0); g.player.body.reset(${(row.x + 3) * T}, ${(row.y + 0.5) * T}); g.cameras.main.centerOn(g.player.x, g.player.y);`);
  await wait(0.5);
  await shot('spotted');
  check('getting caught = warning 1 and scrap confiscated', await waitFor('g.hud.warnings === 1', 5));
  check('...and the bag is empty', await G('return g.player.bag.isEmpty;'));

  await G('calm(); put(g.player.body, spawnTile()); g.boss.timer = 0.1;');
  await wait(0.3);
  const p0 = await G('return [g.boss.x, g.boss.y];');
  // He pauses at each stop, so give him a little while to get going, but he must keep moving.
  const walked = await waitFor(`Math.hypot(g.boss.x - ${p0[0]}, g.boss.y - ${p0[1]}) > ${3 * T}`, 10);
  check('Mr. Gravy walks his patrol (3+ tiles within 10s)', walked, { p0, p1: await G('return [g.boss.x, g.boss.y, g.boss.state];') });

  // A locked door with loot behind it that can't be reached until it's unlocked.
  const door = await G(`const d = g.world.doors.find((d) => d.locked);
    if (!d) return null;
    const from = steps(spawnTile());
    const tiles = [];
    for (let y = d.rect.top; y < d.rect.bottom; y += T) for (let x = d.rect.left; x < d.rect.right; x += T) tiles.push(tileOf({ x, y }));
    const side = tiles.flatMap((t) => DIRS.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))).find((t) => from.has(key(t)) && inReach(t).length === 0);
    // Loot nobody can get to (or stand beside) while the door is locked.
    window.__behind = g.world.fixtures.filter((f) => ![[0, 0], ...DIRS].some(([dx, dy]) => from.has(key({ x: tileOf(f).x + dx, y: tileOf(f).y + dy }))));
    put(g.player.body, side);
    return { tiles, behind: window.__behind.map((f) => f.def.id) };`);
  check('the map has a locked door with loot behind it', door && door.behind.length > 0, door);
  await wait(0.2);
  check('locked door offers unlock', (await G('return g.hud.prompt;'))?.startsWith('Unlock'), await G('return g.hud.prompt;'));
  await tap('e');
  check(
    'door unlocks and stops blocking',
    await waitFor(`!g.world.doors.some((d) => d.locked) && ${JSON.stringify(door?.tiles ?? [])}.every((t) => !g.world.nav.blocked(t.x, t.y) && !g.world.sight.blocked(t.x, t.y))`, 5),
  );
  const deep = await G(`const from = steps(spawnTile());
    const loot = window.__behind.filter((f) => spotBy(f, from));
    const f = loot.find((f) => f.def.id === 'abandoned_copper_pile') ?? loot[0];
    put(g.player.body, spotBy(f, from));
    return { room: g.world.roomAt(f.x, f.y), label: f.label, low: f.def.range?.[0] ?? f.def.scrap, high: f.def.range?.[1] ?? f.def.scrap };`);
  await wait(0.2);
  check(
    `behind the door, the ${deep.label} in the ${deep.room} is in reach`,
    await G(`return g.hud.location === ${JSON.stringify(deep.room)} && g.hud.prompt.includes(${JSON.stringify(deep.label)});`),
    await G('return [g.hud.location, g.hud.prompt];'),
  );
  await tap('e');
  check(`${deep.label} gives ${deep.low}${deep.high > deep.low ? `-${deep.high}` : ''}`, await waitFor(`g.player.bag.total >= ${deep.low} && g.player.bag.total <= ${deep.high}`, 8));
  await shot('deep-room');

  const len = await shiftLength();
  await G(`g.elapsed = ${len / 2 - 0.5};`);
  check("Mr. Gravy speeds up at half shift (he's had his coffee)", await waitFor('g.boss.speedMultiplier === B.shift.bossSpeedUpMultiplier', 2));

  // Wait on the scene state itself (a busy machine can take a while to run the next frame).
  const sceneIs = (state) =>
    page
      .waitForFunction((st) => (st === 'paused' ? window.__COPPER__.game.scene.isPaused('Game') : window.__COPPER__.game.scene.isActive('Game')), state, { timeout: 5000 })
      .then(() => true, () => false);
  await tap('Escape');
  check('Esc pauses', await sceneIs('paused'));
  await shot('paused');
  await tap('Escape');
  check('Esc resumes', await sceneIs('active'));

  await endShift();
  await shot('shift-over');
  check('shift ends at 3:00 PM', await page.evaluate(() => !window.__COPPER__.game.scene.getScene('ShiftEnd').summary.fired));

  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await G(`for (const s of g.students) s.ignore = 9999;
           const r = openRow(6); parkBoss(r, 0);
           g.warnings = 2; g.player.bag.add('copper', 1); g.player.body.reset((r.x + 2.5) * T, (r.y + 0.5) * T);`);
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('fired');
  check('third warning = fired', await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').summary.fired));

  // Back to the menu and pick Tomothy: "Act Like You're Working" makes scrapping look legit.
  await tap('Escape');
  await sceneActive('Menu');
  await page.waitForTimeout(400);
  await tap('ArrowRight');
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await G('calm();');
  await G("standBy('drinking_fountain');");
  await wait(0.2);
  await tap('q');
  await wait(0.1);
  await tap('e');
  await wait(0.3);
  const tom = await G(`const f = g.world.fixtures.find((f) => f.def.id === 'drinking_fountain' && dist(f, g.player) < T * 1.2);
    return { got: g.player.channel?.duration, want: f.def.workSeconds * B.repair.reference / (g.player.character.stats.repair + B.repair.specialtyBonus), id: g.player.character.id };`);
  check('crew select: Tomothy is on shift', tom.id === 'tomothy', tom);
  check('Tomothy scraps faster (repair 3 + 0.5 plumbing bonus)', Math.abs(tom.got - tom.want) < 0.01, tom);
  check("Tomothy's ability hides scrapping", await G('return g.player.isScrapping && g.player.lookingBusy && !g.player.suspicious;'));
  check('Tomothy carries 3 and walks slower than Dalton', await G('return g.player.bag.capacity === 3 && g.player.speed === R.tilesPerSecond(1) * T;'));

  check('no console errors (desktop)', errors.length === 0, errors);
  await context.close();
}

// ---- desktop: students yell, follow, and put the school on high alert -------------------------
if (runs('students')) {
  const { context, page, errors, G, waitFor, wait, trace, stopTrace, watchToasts, shot, sceneActive } = await open('students', {
    viewport: { width: 1600, height: 900 },
  });
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await watchToasts();

  // An open stretch of hallway: student A at its west end looking east, Dalton 3 tiles in front.
  const row = await G('return openRow(9);');
  const studentAt = `{ x: ${(row.x + 0.5) * T}, y: ${(row.y + 0.5) * T} }`;
  const dalton = { x: (row.x + 3.5) * T, y: (row.y + 0.5) * T };
  /** Puts A (and Dalton) back in place: calm, looking straight at him. */
  const faceOff = (who = 0) =>
    `const s = g.students[${who}]; s.standAt(${studentAt}.x, ${studentAt}.y, 0); s.ignore = 0;
     g.player.body.reset(${dalton.x}, ${dalton.y}); g.cameras.main.centerOn(${dalton.x}, ${dalton.y});`;
  // Mr. Gravy far out of earshot, everyone else ignoring Dalton.
  const far = await G(`calm();
    const from = steps(tileOf(${studentAt}));
    let best = null;
    for (const k of from.keys()) { const [x, y] = k.split(',').map(Number); const d = dist({ x, y }, ${JSON.stringify(row)}); if (!best || d > best.d) best = { x, y, d }; }
    parkBoss(best, Math.PI);
    return best;`);
  check('Mr. Gravy is parked out of earshot', far.d > (await G('return B.students.yellHearingTiles;')) + 2, far);
  await G(faceOff());
  await wait(2.5);
  check('with no alert, students ignore an empty-handed Dalton', await G("return g.students[0].state === 'idle' && g.students[0].suspicion === 0 && !g.alert.active;"));

  // Scrap in his bag: the student yells on the very first frame they see it, no notice meter.
  await trace('[g.elapsed, g.students[0].state, g.player.bag.total, g.students[0].suspicion]');
  await G(`${faceOff()} g.player.bag.add('copper', 1);`);
  check('a student who sees Dalton holding scrap yells', await waitFor("g.students[0].state === 'yell'", 2));
  const frames = await stopTrace();
  const firstSeen = frames.findIndex((f) => f[2] > 0);
  check(
    '...instantly: on the first frame, with no "?" before it',
    firstSeen >= 0 && frames[firstSeen][1] === 'yell' && frames.slice(firstSeen).every((f) => f[1] !== 'notice'),
    frames.slice(Math.max(0, firstSeen - 1), firstSeen + 3),
  );
  await shot('yell');
  check(
    'out of earshot: Mr. Gravy doesn\'t come, no high alert, a toast says a student is yelling',
    await G("return g.boss.state === 'pause' && !g.alert.active && window.__toasts.some((t) => t.includes('yelling for'));"),
    await G('return [g.boss.state, g.alert.left, window.__toasts];'),
  );

  // Again with Mr. Gravy within earshot (behind the student, looking away).
  const near = await G(`g.player.bag.takeAll();
    const from = steps(tileOf(${studentAt}));
    const hear = B.students.yellHearingTiles;
    const options = [...from.entries()].map(([k, n]) => { const [x, y] = k.split(',').map(Number); return { x, y, n, d: dist({ x, y }, ${JSON.stringify({ x: row.x + 3, y: row.y })}) }; })
      // Far enough from Dalton not to see him, near enough to the student to hear them.
      .filter((t) => t.d >= 6 && dist(t, ${JSON.stringify(row)}) <= hear - 2 && t.n >= 8 && clearTile(t.x, t.y))
      .sort((a, b) => a.n - b.n);
    const t = options[0];
    parkBoss(t, Math.atan2(t.y - ${row.y}, t.x - ${row.x + 3}));
    return t;`);
  check('Mr. Gravy is parked within earshot', !!near, near);
  // Everything students say from now on (window.__said: [student, line, time]).
  await G(`window.__said = [];
    g.students.forEach((s, i) => { const b = s.bubble; const say = b.say.bind(b); b.say = (text, ...rest) => (window.__said.push([i, text, g.elapsed]), say(text, ...rest)); });`);
  const A = 'g.students[0]';
  await trace(`[g.elapsed, ${A}.state, ${A}.body.speed, ${A}.x, ${A}.y, g.boss.state, g.boss.body.speed, g.boss.x, g.boss.y, ${A}.ignore]`);
  await G(`${faceOff()} g.player.bag.add('copper', 1);`);
  check('the yell reaches Mr. Gravy: he sprints to where Dalton was seen', await waitFor("g.boss.state === 'respond'", 2), await G('return g.boss.state;'));
  const seen = await G('return { ...g.boss.lastSeen };');
  check('...the spot is where Dalton stood', Math.hypot(seen.x - dalton.x, seen.y - dalton.y) < T / 2, { seen, dalton });
  // Dalton drops the scrap and slips away, out of every student's sight.
  const lostAt = await G(`g.player.bag.takeAll();
    const from = steps(spawnTile());
    const away = [...from.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; })
      .filter((t) => g.students.every((s) => dist(center(t), s) > 8 * T)).sort((a, b) => dist(b, ${JSON.stringify(row)}) - dist(a, ${JSON.stringify(row)}))[0];
    put(g.player.body, away);
    return g.elapsed;`);
  check(
    'a report puts the school on HIGH ALERT (HUD banner, toast)',
    await G("return g.alert.active && g.hud.alert && g.hud.alert.total === B.students.highAlertSeconds && window.__toasts.some((t) => t.includes('HIGH ALERT')) && window.__toasts.some((t) => t.includes('heard'));"),
    await G('return [g.hud.alert, window.__toasts];'),
  );
  check(
    'on high alert every student sees further and wider',
    await waitFor('g.students.every((s) => Math.abs(s.visionCone.range - B.students.visionRangeTiles * B.students.highAlertRangeFactor * T) < 1)', 1),
  );
  check('the student follows after yelling', await waitFor(`${A}.state === 'follow'`, 3), await G(`return ${A}.state;`));
  await wait(1.2);
  await G(`lookAt(${A});`);
  await wait(0.3);
  await shot('high-alert-follow');
  await G('lookAt(g.player);');
  // Wait for both: the student giving up, and Mr. Gravy done with the spot.
  check(
    'after a while without seeing him the student gives up',
    await waitFor(`['idle', 'walk'].includes(${A}.state) && !['respond', 'search'].includes(g.boss.state)`, 20),
    await G(`return [${A}.state, g.boss.state];`),
  );
  const frames2 = await stopTrace();
  const said = await G('return window.__said;');
  const giveUp = await G('return B.students.followGiveUpSeconds;');
  const gaveUp = frames2.find((f, i) => i > 0 && frames2[i - 1][1] === 'follow' && ['idle', 'walk'].includes(f[1]));
  check(`...after ${giveUp}s out of sight, then leaves him alone for a while`, gaveUp && gaveUp[0] - lostAt >= giveUp - 0.25 && gaveUp[9] > 0, { lostAt, gaveUp });
  const following = frames2.filter((f) => f[1] === 'follow');
  const followSpeed = Math.max(0, ...following.map((f) => f[2]));
  const walkSpeed = await G(`return ${A}.walkSpeed;`);
  const moved = following.length ? Math.hypot(following.at(-1)[3] - following[0][3], following.at(-1)[4] - following[0][4]) : 0;
  check(
    'the student follows slowly (half their walking speed) towards where they saw him',
    followSpeed > 0 && Math.abs(followSpeed - walkSpeed * (await G('return B.students.followFactor;'))) < 1 && followSpeed < walkSpeed && moved > T,
    { followSpeed, walkSpeed, moved },
  );
  const sprint = Math.max(0, ...frames2.filter((f) => f[5] === 'respond').map((f) => f[6]));
  const sprintWant = await G('return R.tilesPerSecond(g.boss.def.speed) * T * g.boss.speedMultiplier * B.boss.sprintFactor;');
  check("Mr. Gravy's sprint is faster than his chase", Math.abs(sprint - sprintWant) < 1, { sprint, sprintWant });
  const searched = frames2.find((f, i) => i > 0 && frames2[i - 1][5] === 'respond' && f[5] === 'search');
  check(
    'Mr. Gravy reaches the spot and searches there',
    searched && Math.hypot(searched[7] - seen.x, searched[8] - seen.y) < T,
    { searched, seen },
  );
  const talkers = new Set(said.filter(([i, , t]) => i !== 0 && t >= lostAt - 1).map(([i]) => i));
  check('students talk about it (chatter from most of the others)', talkers.size >= Math.min(3, (await G('return g.students.length;')) - 1), said);

  // High alert: another student recognises Dalton even empty-handed ('?' fills, then they yell).
  await G(`g.students[0].ignore = 9999; ${faceOff(1)} g.boss.grace = 9999;`);
  check('on high alert an empty-handed Dalton gets noticed ("?")', await waitFor("g.students[1].state === 'notice' && g.students[1].suspicion > 0", 1.5), await G('return g.students[1].state;'));
  await wait(0.4);
  await shot('notice');
  check('...and then yelled at', await waitFor("g.students[1].state === 'yell'", 6), await G('return [g.students[1].state, g.students[1].suspicion];'));

  // Mr. Gravy catches Dalton: whoever was after him calms down ("Busted!").
  check('the second student follows', await waitFor("g.students[1].state === 'follow'", 3));
  await G(`parkBoss(tileOf({ x: ${dalton.x - 2 * T}, y: ${dalton.y} }), 0); g.player.bag.add('copper', 1);`);
  check('Mr. Gravy catches him', await waitFor('g.hud.warnings === 1', 5));
  check('...and the students calm down', await G("return ['idle', 'walk'].includes(g.students[1].state) && g.students[1].ignore > 0 && g.students[1].saying;"));

  await G('g.alert.left = 0.3;');
  check('the high alert runs out (banner gone, cones back to normal)', await waitFor('!g.alert.active && g.hud.alert === null && g.students.every((s) => Math.abs(s.visionCone.range - B.students.visionRangeTiles * T) < 1)', 2));
  check('no console errors (students)', errors.length === 0, errors);
  await context.close();
}

// ---- desktop: the sleepy coworker under a desk ------------------------------------------------
if (runs('coworker')) {
  const { context, page, errors, G, waitFor, wait, tap, shot, sceneActive, endShift } = await open('coworker', { viewport: { width: 1600, height: 900 } });
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await G('calm(); g.coworkerChance = 1;');
  await G("standBy('desk');");
  await wait(0.2);
  check('prompt offers a desk', (await G('return g.hud.prompt;'))?.includes('Desk'), await G('return g.hud.prompt;'));
  await tap('e');
  check('scrapping a desk wakes the sleepy coworker (chance forced to 1)', await waitFor('g.coworker !== null', 8));
  check('...after the desk is done', await G('return g.player.bag.total > 0 && !g.player.channel;'));
  await wait(0.5);
  await shot('nap');
  check('he wakes up and talks in the dialog box', await waitFor("h.dialog.open && h.dialogShown?.line.speaker === 'Sleepy Coworker'", 6));
  check(
    '...with his portrait',
    await G("return h.dialogLayer.visible && h.dialogPortrait.visible && h.dialogShown.line.portrait === 'sleepy_coworker_big' && gm.textures.exists('sleepy_coworker_big');"),
  );
  await wait(0.8);
  await shot('dialog');
  check('he pays $50 to keep quiet', await waitFor('g.hushMoney === B.sleepyCoworker.hushMoney', 8));
  check('...into the shift earnings', await G('return g.hud.money === B.sleepyCoworker.hushMoney;'), await G('return g.hud.money;'));
  check('...saying so', await waitFor("h.dialogShown?.line.text.includes('$50')", 2), await G('return h.dialogShown?.line.text;'));
  await wait(0.6);
  await shot('paid');
  check('then he shuffles off and is gone', await waitFor('g.coworker === null', 25));
  await endShift();
  await shot('shift-over');
  const summary = await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').summary);
  check('the shift summary counts the hush money', summary.hushMoney === 50 && summary.earned === 50, summary);
  check(
    '...on its own line',
    await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').children.list.some((o) => o.text?.startsWith('Hush money'))),
  );
  check('no console errors (coworker)', errors.length === 0, errors);
  await context.close();
}

// ---- desktop: the map editor, in Copper Studio's Map tab ------------------------------------------
if (runs('editor')) {
  const { context, page, errors, G, wait, shot, sceneActive, toScreen, click, endShift } = await open(
    'editor',
    { viewport: { width: 1600, height: 900 } },
    { target: `${url}#studio`, ready: 'studio' },
  );
  const kit = studioKit(page);
  await kit.tab('map');
  await sceneActive('Editor');
  await kit.until(() => !window.__COPPER__.game.scene.getScene('Editor').cameras.main.fadeEffect.isRunning);
  await shot('open');
  const cell = (c) => toScreen('Editor', (c.x + 0.5) * T, (c.y + 0.5) * T, 'mapCam');
  const editor = (src) => G(`const rows = ed.rows; const at = (x, y) => rows[y]?.[x]; ${src}`);
  /** Whether `cond` (using ed) comes true within a few seconds. */
  const edHolds = (cond, timeout = 10000) => kit.holds((cond) => new Function('ed', `return (${cond});`)(window.__COPPER__.game.scene.getScene('Editor')), cond, timeout);
  /** The editor has checked the map since the last edit (300 ms of game time after it). */
  const checked = 'ed.validateTimer === null && !ed.dirty';

  // Spots found in the map text: a hallway stretch with hallway above and below, two hallway tiles
  // with hallway all around, and open asphalt for a car (all where a click reaches the map).
  const spots = await editor(`
    const open = (x, y, ch, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) !== ch) return false; return edClickable({ x, y }); };
    let wall = null, pile = null, plant = null, car = null;
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      if (!wall && [0, 1, 2, 3, 4, 5, 6].every((i) => open(x + i, y, '.'))) wall = { x, y };
      if (!pile && open(x, y, '.') && (!wall || Math.abs(y - wall.y) > 2)) pile = { x, y };
      else if (pile && !plant && open(x, y, '.') && Math.hypot(x - pile.x, y - pile.y) > 3 && (!wall || Math.abs(y - wall.y) > 2)) plant = { x, y };
      if (!car && open(x, y, 'p') && open(x + 1, y + 1, 'p')) car = { x, y };
    }
    return { wall, pile, plant, car };`);
  check('the map has room for the editor checks', spots.wall && spots.pile && spots.plant && spots.car, spots);
  const { wall, pile, plant, car } = spots;

  // Drag a wall along the hallway with the real mouse.
  await G("ed.selectTool('#');");
  const a = await cell(wall);
  const b = await cell({ x: wall.x + 6, y: wall.y });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  const wallRow = `ed.rows[${wall.y}].slice(${wall.x}, ${wall.x + 7})`;
  check('dragging paints a wall with no gaps', await edHolds(`${wallRow} === '#######'`), await G(`return ed.rows[${wall.y}];`));
  await page.keyboard.press('Control+z');
  check('undo takes the whole stroke back', await edHolds(`!${wallRow}.includes('#')`));
  await page.keyboard.press('Control+y');
  check('redo puts it back', await edHolds(`${wallRow} === '#######'`));
  await page.keyboard.press('Control+z');
  await edHolds(`!${wallRow}.includes('#')`);

  // Place an abandoned copper pile and a plant.
  await G("ed.selectTool('c');");
  await click(await cell(pile));
  check('placed a copper pile', await edHolds(`ed.rows[${pile.y}][${pile.x}] === 'c'`));
  await G("ed.selectTool('*');");
  await click(await cell(plant));
  check('placed a plant', await edHolds(`ed.rows[${plant.y}][${plant.x}] === '*'`));

  // A car is stamped whole (2x2, the tapped tile at its top-left) and erased whole.
  const carCells = `[0, 1].flatMap((dy) => [0, 1].map((dx) => ed.rows[${car.y} + dy][${car.x} + dx]))`;
  await G("ed.selectTool('C');");
  await click(await cell(car));
  check('stamps a whole 2x2 car', await edHolds(`${carCells}.join('') === 'CCCC'`), await G(`return ${carCells};`));
  await edHolds(checked);
  await shot('car');
  await G("ed.selectTool('erase');");
  await click(await cell({ x: car.x + 1, y: car.y + 1 }));
  check('erasing one corner of the car removes all of it', await edHolds(`${carCells}.join('') === 'pppp'`), await G(`return ${carCells};`));
  check('problems panel says ready to play', (await edHolds(checked)) && (await G('return ed.report.errors.length === 0;')), await G('return ed.report.errors;'));
  await shot('edited');

  const play = await G("const b = ed.buttons.find((b) => b.label.text === 'PLAY'); return { x: b.rect.centerX, y: b.rect.centerY };");
  await click(await toScreen('Editor', play.x, play.y, 'uiCam'));
  await sceneActive('Game');
  await wait(0.5);
  check(
    'PLAY starts the game on the edited map',
    await G(`return g.world.fixtures.some((f) => f.def.id === 'abandoned_copper_pile' && tileOf(f).x === ${pile.x} && tileOf(f).y === ${pile.y})
             && g.world.map.decor.some((d) => d.id === 'plant' && d.x === ${plant.x} && d.y === ${plant.y})
             && !g.world.map.decor.some((d) => d.id === 'car' && d.x === ${car.x} && d.y === ${car.y})
             && g.world.nav.blocked(${plant.x}, ${plant.y}) && !g.world.sight.blocked(${plant.x}, ${plant.y});`),
  );
  await G(`calm(); put(g.player.body, { x: ${plant.x}, y: ${plant.y + 1} });`);
  await wait(1);
  await shot('played');
  await endShift();
  // The end screen has no EDIT MAP any more: the play test's ◀ STUDIO goes back to the Map tab.
  await page.click('.cs-back');
  await kit.until(() => window.__COPPER__.studio.isOpen && window.__COPPER__.game.scene.isActive('Editor'));
  check(
    '◀ STUDIO after the shift goes back to the Map tab, on the same map',
    (await page.getAttribute('.cs-tab[data-tab="map"]', 'aria-selected')) === 'true' && (await G(`return ed.rows[${pile.y}][${pile.x}] === 'c' && ed.rows[${plant.y}][${plant.x}] === '*';`)),
  );
  check('no console errors (editor)', errors.length === 0, errors);
  await context.close();
}

// ---- Copper Studio: settings, play tests and the Map tab; saving on claude.ai; on a phone ----------
if (runs('studio')) {
  // What the Studio should show comes from its source: the settings list (src/config/schema.ts),
  // the tuning rules and the Studio's search.
  const [schema, tuning, fieldsModule, mapText, maps] = await loadSource(['/src/config/schema.ts', '/src/config/tuning.ts', '/src/studio/fields.ts', '/src/world/mapText.ts', '/src/world/maps.ts']);
  const { SECTIONS, FIELD_BY_PATH, checkValue, formatValue } = schema;
  const { DEFAULTS, getPath, valuesWith } = tuning;
  const { searchFields } = fieldsModule;
  const { mapNotes } = mapText;
  const { DEFAULT_MAP } = maps;
  const GRAVY = 'npcs.mr_gravy.speed';
  const DALTON = 'characters.dalton.stats.speed';
  const SHIFT = 'balance.shift.lengthSeconds';
  const HUSH = 'balance.sleepyCoworker.hushMoney';
  const sectionOf = (path) => SECTIONS.find((s) => s.groups.some((g) => g.fields.some((f) => f.path === path))).id;
  const sectionFields = (id) => SECTIONS.find((s) => s.id === id).groups.flatMap((g) => g.fields);
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  const approx = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
  /** The first of `options` that isn't `now` (so a check always changes something, whatever is saved). */
  const other = (now, ...options) => options.find((v) => v !== now);
  /** A preview as the field draws it (it shows nothing when its preview can't be worked out). */
  const previewOf = (field, values) => {
    try {
      return field.preview(values);
    } catch {
      return '';
    }
  };
  /** The value of `path` in the draft (the shipped value with the draft's overrides on top). */
  const draftValue = async (kit, path) => getPath(valuesWith((await kit.snapshot()).draft.values), path);
  const cellOf = (toScreen) => (c) => toScreen('Editor', (c.x + 0.5) * T, (c.y + 0.5) * T, 'mapCam');
  const editorButton = async (G, toScreen, label) => {
    const b = await G(`const b = ed.buttons.find((b) => b.label.text === ${JSON.stringify(label)}); return { x: b.rect.centerX, y: b.rect.centerY };`);
    return toScreen('Editor', b.x, b.y, 'uiCam');
  };
  const editorReady = (kit, timeout) =>
    kit.until(() => window.__COPPER__.game.scene.isActive('Editor') && !window.__COPPER__.game.scene.getScene('Editor').cameras.main.fadeEffect.isRunning, null, timeout);

  // ---- (a)-(c) on the preview build: a static copy, so the Studio opens (with #studio) but can't save.
  {
    const { context, page, errors, G, wait, shot, sceneActive, toScreen, click, endShift } = await open(
      'studio',
      { viewport: { width: 1600, height: 900 } },
      { target: `${url}#studio`, ready: 'studio' },
    );
    const kit = studioKit(page);
    const saved = await page.evaluate(() => window.__COPPER__.tuning());
    const savedValues = valuesWith(saved.values);

    if (!process.env.E2E_URL) {
      const readonly = await kit.holds(() => document.querySelector('.cs-note[data-note="readonly"]') !== null);
      const save = await page.locator('.cs-head .cs-btn.is-primary').evaluate((b) => ({ disabled: b.disabled, title: b.title }));
      check(
        'Studio on a static copy (the preview build): #studio opens it with saving off, saying why',
        readonly && save.disabled && /static copy/.test(save.title) && /Export/.test(await page.locator('.cs-note[data-note="readonly"]').textContent()),
        save,
      );
    }

    // (a) Every section shows every one of its settings, rare ones folded away, previews worked out.
    for (const section of SECTIONS) {
      await kit.tab(section.id);
      const shown = await page.$$eval('.cs-main .cs-field[data-path]', (els) =>
        els.map((el) => ({
          path: el.dataset.path,
          label: el.querySelector('.cs-label')?.textContent ?? '',
          control: el.querySelector('.cs-control input, .cs-control select, .cs-control textarea') !== null,
          preview: el.querySelector('.cs-preview')?.textContent ?? null,
          folded: el.offsetParent === null,
        })),
      );
      const want = section.groups.flatMap((g) => g.fields);
      const byPath = new Map(shown.map((s) => [s.path, s]));
      const wrong = want
        .filter((f) => {
          const s = byPath.get(f.path);
          return !s || s.label !== f.label || !s.control || s.folded !== !!f.advanced || (f.preview && s.preview !== previewOf(f, savedValues));
        })
        .map((f) => ({ path: f.path, shown: byPath.get(f.path), preview: f.preview ? previewOf(f, savedValues) : undefined }));
      check(
        `Studio: ${section.title} shows all ${want.length} of its settings with their controls and previews (rare ones under "More settings")`,
        shown.length === want.length && wrong.length === 0,
        { shown: shown.length, want: want.length, wrong: wrong.slice(0, 3) },
      );
      if (section.id === 'crew' || section.id === 'loot') await shot(section.id);
    }
    const rare = SECTIONS.flatMap((s) => s.groups.map((g) => ({ section: s.id, group: g, n: g.fields.filter((f) => f.advanced).length }))).find((x) => x.n > 0);
    if (rare) {
      await kit.tab(rare.section);
      const more = page.locator(`.cs-card[data-group="${rare.group.id}"] .cs-more`);
      const label = await more.textContent();
      await more.click();
      const unfolded = await page.$$eval(`.cs-card[data-group="${rare.group.id}"] .cs-field`, (els) => els.every((el) => el.offsetParent !== null));
      check(`..."More settings (${rare.n})" unfolds the rare ones (${rare.group.title})`, label.includes(`More settings (${rare.n})`) && unfolded, label);
    }

    // Editing a value: its preview and the unsaved count follow.
    const gravyField = FIELD_BY_PATH.get(GRAVY);
    const gravyNow = getPath(savedValues, GRAVY);
    const gravyNew = other(gravyNow, 1.5, 2.5);
    await kit.tab('gravy');
    const before = { preview: await kit.field(GRAVY).locator('.cs-preview').textContent(), unsaved: await kit.unsaved() };
    await kit.type(GRAVY, gravyNew);
    const typed = await page.evaluate((path) => {
      const el = document.querySelector(`.cs-field[data-path="${path}"]`);
      return {
        preview: el.querySelector('.cs-preview').textContent,
        marked: el.classList.contains('is-unsaved'),
        unsaved: Number(document.querySelector('.cs-chip[data-unsaved]').dataset.unsaved),
        badge: document.querySelector('.cs-tab[data-tab="gravy"] .cs-count:not([hidden])')?.textContent ?? null,
      };
    }, GRAVY);
    const gravyPreview = previewOf(gravyField, valuesWith((await kit.snapshot()).draft.values));
    check(
      `Studio: typing ${gravyNew} for Mr. Gravy's speed updates its preview, the unsaved count and the tab's badge`,
      (await draftValue(kit, GRAVY)) === gravyNew && typed.preview === gravyPreview && typed.preview !== before.preview && typed.unsaved === before.unsaved + 1 && typed.badge === '1' && typed.marked,
      { typed, gravyPreview, before },
    );
    await shot('edited');
    // Past the limit: clamped, and the field says so.
    const max = gravyField.kind.max;
    const gravyInput = kit.field(GRAVY).locator('input.cs-num');
    await gravyInput.fill(String(max + 91));
    const clampNote = await kit.field(GRAVY).locator('.cs-msg').textContent();
    await gravyInput.blur();
    check(
      `...a number past its limit is clamped to ${max}, saying so`,
      (await draftValue(kit, GRAVY)) === max && (await gravyInput.inputValue()) === String(max) && clampNote.includes(String(max)),
      { clampNote, input: await gravyInput.inputValue() },
    );
    // Per-field Undo (back to the saved value) and Reset (back to the shipped one).
    await kit.type(GRAVY, gravyNew);
    const status = await kit.status(GRAVY);
    await kit.link(GRAVY, 'Undo');
    const undone = { value: await draftValue(kit, GRAVY), input: await gravyInput.inputValue(), unsaved: await kit.unsaved() };
    check(
      `...its Undo puts back the saved value (${gravyNow})`,
      status.includes(`was ${formatValue(gravyField, gravyNow)}`) && undone.value === gravyNow && undone.input === String(gravyNow) && undone.unsaved === before.unsaved,
      { status, undone },
    );
    const shippedGravy = getPath(DEFAULTS, GRAVY);
    await kit.type(GRAVY, gravyNew);
    await kit.link(GRAVY, 'Reset');
    check(
      `...and its Reset the value the game ships with (${shippedGravy})`,
      (await draftValue(kit, GRAVY)) === shippedGravy && (await gravyInput.inputValue()) === String(shippedGravy),
      await gravyInput.inputValue(),
    );

    // Search: every matching setting, from every section, and only those.
    await page.fill('.cs-search', 'speed');
    await kit.until(() => document.querySelector('.cs-main .cs-h1')?.textContent === 'Search');
    const hits = await page.$$eval('.cs-main .cs-field[data-path]', (els) => els.map((el) => el.dataset.path));
    const wantHits = searchFields('speed').map((hit) => hit.field.path);
    const crumbs = await page.$$eval('.cs-main .cs-crumb', (els) => [...new Set(els.map((el) => el.textContent))]);
    const selected = await page.$$eval('.cs-tab[aria-selected="true"]', (els) => els.length);
    check(
      `Studio: searching "speed" shows exactly the ${wantHits.length} settings that match, under their sections`,
      sameSet(hits, wantHits) && crumbs.length > 1 && selected === 0,
      { hits, wantHits, crumbs },
    );
    await shot('search');
    await page.fill('.cs-search', 'qqqzzz');
    await kit.until(() => document.querySelector('.cs-main .cs-blurb')?.textContent.startsWith('Nothing matches'));
    check('...and nothing for a word no setting has', (await page.locator('.cs-main .cs-field').count()) === 0);
    await page.press('.cs-search', 'Escape');
    check(
      '...Escape clears the search, back to the tab',
      (await page.inputValue('.cs-search')) === '' && (await page.getAttribute('.cs-tab[data-tab="gravy"]', 'aria-selected')) === 'true',
    );

    // (b) Play test: the draft runs in a real shift.
    const daltonNow = getPath(savedValues, DALTON);
    const daltonNew = other(daltonNow, 4, 2);
    await kit.type(GRAVY, gravyNew);
    await kit.tab('crew');
    await kit.type(DALTON, daltonNew);
    const pending = await kit.unsaved();
    await page.selectOption('.cs-play select', 'dalton');
    await page.click('.cs-play .cs-btn');
    await sceneActive('Game');
    await kit.until(() => window.__COPPER__.game.scene.getScene('Game').elapsed > 0.3 && window.__COPPER__.game.registry.get('hud:layout'));
    const run = await G(`return {
      playing: window.__COPPER__.studio.isPlaying, studioHidden: document.querySelector('.cs').hidden, crew: g.player.character.id,
      player: g.player.speed, wantPlayer: R.tilesPerSecond(${daltonNew}) * T, boss: g.boss.chaseSpeed, wantBoss: R.tilesPerSecond(${gravyNew}) * T };`);
    check(
      `Studio: Play test runs the draft: Dalton walks at speed ${daltonNew}, Mr. Gravy chases at speed ${gravyNew}`,
      run.playing && run.studioHidden && run.crew === 'dalton' && approx(run.player, run.wantPlayer) && approx(run.boss, run.wantBoss),
      run,
    );
    const back = await backButton(page);
    check('...with a ◀ STUDIO button clear of the HUD', back.visible && back.hits.length === 0, back);
    await shot('playtest');
    await endShift();
    const endLabel = await screenLabel(page, 'ShiftEnd');
    check(
      '...its end screen says it was a play test of the draft, ◀ STUDIO still there',
      endLabel === `Play test · draft, ${pending} unsaved change${pending === 1 ? '' : 's'}` && (await backButton(page)).visible,
      endLabel,
    );
    await shot('playtest-end');
    await page.click('.cs-back');
    await kit.until(() => window.__COPPER__.studio.isOpen && !window.__COPPER__.game.scene.isActive('ShiftEnd'));
    check('◀ STUDIO comes back to the Studio, the draft as it was', (await kit.unsaved()) === pending && !(await backButton(page)).visible);
    await kit.menu('Exit studio');
    await sceneActive('Menu');
    const exited = await page.evaluate(() => ({
      tuning: window.__COPPER__.tuning(),
      hash: location.hash,
      studio: window.__COPPER__.studio.isOpen,
      // A control still focused in the hidden Studio would keep the game's keys (Enter below) from it.
      focusInStudio: document.activeElement?.closest('.cs') != null,
    }));
    const menuLabel = await screenLabel(page);
    check(
      'Exit studio goes back to the game running the saved version (the draft is kept for next time), and the keyboard goes back to the game',
      !exited.studio && exited.tuning.revision === saved.revision && JSON.stringify(exited.tuning.values) === JSON.stringify(saved.values) && exited.hash === '' && !exited.focusInStudio && !menuLabel?.startsWith('Play test') && (await kit.snapshot()).unsaved === pending,
      { exited: { ...exited, tuning: { revision: exited.tuning.revision, values: exited.tuning.values } }, menuLabel },
    );
    await page.keyboard.press('Enter');
    await sceneActive('Game');
    await kit.until(() => window.__COPPER__.game.scene.getScene('Game').elapsed > 0.2);
    const real = await G(`return { player: g.player.speed, wantPlayer: R.tilesPerSecond(${daltonNow}) * T, boss: g.boss.chaseSpeed, wantBoss: R.tilesPerSecond(${gravyNow}) * T };`);
    check('...a shift from the menu has the saved speeds again', approx(real.player, real.wantPlayer) && approx(real.boss, real.wantBoss), real);

    // (c) The Map tab: the editor inside the Studio, its edits in the draft, play tested.
    await page.evaluate(() => (location.hash = '#studio'));
    await kit.until(() => window.__COPPER__.studio.isOpen);
    await kit.tab('map');
    await editorReady(kit);
    const placed = await page.evaluate(() => {
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height];
      };
      return { canvas: rect(window.__COPPER__.game.canvas), host: rect(document.querySelector('.cs-maphost')), head: rect(document.querySelector('.cs-head')), menu: window.__COPPER__.game.scene.isActive('Menu') };
    });
    check(
      'Studio Map tab: the map editor runs inside the Studio, its canvas laid over the page area under the header',
      placed.canvas.every((v, i) => Math.abs(v - placed.host[i]) <= 1) && placed.canvas[1] >= placed.head[1] + placed.head[3] - 1 && !placed.menu,
      placed,
    );
    const spot = await G('return edOpenHall();');
    const unsavedBefore = await kit.unsaved();
    await G("ed.selectTool('c');");
    await click(await cellOf(toScreen)(spot));
    await kit.holds(() => window.__COPPER__.studio.snapshot().draft.map !== null);
    const draftMap = (await kit.snapshot()).draft.map;
    const badge = await page.locator('.cs-tab[data-tab="map"] .cs-count').isVisible();
    check(
      'a copper pile painted on the map lands in the draft map (the Map tab is marked unsaved)',
      draftMap !== null && gridRows(draftMap)[spot.y]?.[spot.x] === 'c' && (await kit.unsaved()) === unsavedBefore + 1 && badge,
      { spot, badge, unsaved: await kit.unsaved() },
    );
    await shot('map');
    await click(await editorButton(G, toScreen, 'PLAY'));
    await sceneActive('Game');
    await kit.until(() => window.__COPPER__.game.scene.getScene('Game').elapsed > 0.2);
    check(
      "the editor's PLAY play tests the draft map: the copper pile is in the school",
      await G(`return window.__COPPER__.studio.isPlaying && g.world.fixtures.some((f) => f.def.id === 'abandoned_copper_pile' && tileOf(f).x === ${spot.x} && tileOf(f).y === ${spot.y});`),
    );
    await G(`calm(); put(g.player.body, { x: ${spot.x}, y: ${spot.y + 1} });`);
    await wait(0.5);
    await shot('map-played');
    await page.click('.cs-back');
    await kit.until(() => window.__COPPER__.studio.isOpen && window.__COPPER__.game.scene.isActive('Editor'));
    check(
      '◀ STUDIO comes back to the Map tab, the pile still on the map',
      (await page.getAttribute('.cs-tab[data-tab="map"]', 'aria-selected')) === 'true' && (await G(`return ed.rows[${spot.y}][${spot.x}] === 'c';`)),
    );
    check('no console errors (studio)', errors.length === 0, errors);
    await context.close();
  }

  // ---- (d) the save round trip on claude.ai: the game page as it is published there ---------------
  const single = await readFile(`${ROOT}dist-single/index.html`, 'utf8').catch(() => null);
  check('the single-file build is there to make the claude.ai page from (npm run build:single)', single !== null);
  if (single) {
    const content = buildArtifactPage(single, await readFile(`${ROOT}src/config/tuning.json`, 'utf8'));
    const original = parsePage(content);
    const live = JSON.parse(original.tuning);
    const next = live.revision + 1;
    const liveValues = valuesWith(live.values);
    const host = { versions: [wrapInHost(content)] };
    const edits = {
      [GRAVY]: other(getPath(liveValues, GRAVY), 1.5, 2.5),
      [DALTON]: other(getPath(liveValues, DALTON), 4, 2),
      [SHIFT]: other(getPath(liveValues, SHIFT), 240, 360),
      [HUSH]: other(getPath(liveValues, HUSH), 75, 40),
    };
    const NOTE = "Gravy slower, a copper pile in the hall </script><b>!</b> $' $&";
    let spot = null;
    let published = null;

    // The owner: STUDIO on the menu; values and the map changed; a broken map refused; Save.
    {
      const { context, page, errors, G, shot, sceneActive, toScreen, click, buttonPos } = await open(
        'published-owner',
        { viewport: { width: 1600, height: 900 } },
        { target: PAGE_URL, setup: hostSetup(host, true) },
      );
      const kit = studioKit(page);
      const offered = await kit.holds(() => window.__COPPER__.game.scene.getScene('Menu').children.list.some((o) => o.label?.text === 'STUDIO'), null, 30000);
      check("claude.ai, the game's owner: the menu offers STUDIO beside START SHIFT", offered && (await menuButtons(page)).includes('START SHIFT'), await menuButtons(page));
      await shot('menu');
      await click(await buttonPos('Menu', 'STUDIO'));
      await kit.until(READY.studio);
      await kit.until(() => !document.querySelector('.cs-head .cs-btn.is-primary').title.startsWith('Checking'));
      check('...STUDIO opens Copper Studio, Save waiting for a change', (await page.locator('.cs-head .cs-btn.is-primary').getAttribute('title')) === 'No unsaved changes');
      for (const [path, value] of Object.entries(edits)) {
        await kit.tab(sectionOf(path));
        await kit.type(path, value);
      }
      const values = (await kit.snapshot()).draft.values;
      check(`...the owner changes ${Object.keys(edits).length} values`, Object.entries(edits).every(([path, value]) => getPath(valuesWith(values), path) === value), values);

      await kit.tab('map');
      await editorReady(kit);
      spot = await G('return edOpenHall();');
      await G("ed.selectTool('c');");
      await click(await cellOf(toScreen)(spot));
      await kit.holds(() => window.__COPPER__.studio.snapshot().draft.map !== null);
      check('...and paints a copper pile on the map', gridRows((await kit.snapshot()).draft.map ?? '')[spot.y]?.[spot.x] === 'c', spot);

      // A map that can't be played can't be saved (or play tested) either.
      const van = await G("const cells = []; ed.rows.forEach((r, y) => [...r].forEach((ch, x) => ch === 'V' && cells.push({ x, y }))); return cells.find(edClickable) ?? null;");
      await G("ed.selectTool('erase');");
      await click(await cellOf(toScreen)(van));
      const broken = await kit.holds(() => {
        const ed = window.__COPPER__.game.scene.getScene('Editor');
        return ed.report.errors.length > 0 && ed.validateTimer === null && !ed.dirty;
      });
      const problem = await G('return ed.report.errors[0] ?? null;');
      await page.click('.cs-head .cs-btn.is-primary');
      await page.waitForSelector('.cs-dialog');
      const refusal = await page.evaluate(() => ({ box: document.querySelector('.cs-dialog .cs-box.is-bad')?.textContent ?? '', saveOff: document.querySelector('.cs-dialog .cs-btn.is-primary').disabled }));
      check("a map with a problem (the van erased) can't be saved: Save names the problem, its button off", broken && !!problem && refusal.saveOff && refusal.box.includes(problem), { problem, refusal });
      await shot('map-refused');
      await page.keyboard.press('Escape');
      await page.click('.cs-play .cs-btn');
      const noPlay = await kit.holds((p) => [...document.querySelectorAll('.cs-toast')].some((t) => t.textContent.includes(p)), problem, 5000);
      check('...nor play tested', noPlay && !(await page.evaluate(() => window.__COPPER__.studio.isPlaying)));
      await click(await editorButton(G, toScreen, 'UNDO'));
      const fixed = await kit.holds(() => {
        const ed = window.__COPPER__.game.scene.getScene('Editor');
        const map = window.__COPPER__.studio.snapshot().draft.map ?? '';
        // The van is back in the draft's grid (the legend notes at the top mention a V too).
        const van = map.split('\n').some((line) => !line.startsWith('//') && !line.startsWith('@') && line.includes('V'));
        return ed.report.errors.length === 0 && ed.validateTimer === null && !ed.dirty && van;
      });
      check('UNDO brings the van back: the map is fine again (the pile still there)', fixed && gridRows((await kit.snapshot()).draft.map ?? '')[spot.y]?.[spot.x] === 'c');

      // Save with a note: the page republishes itself, and claude.ai reloads it.
      await page.click('.cs-head .cs-btn.is-primary');
      await page.waitForSelector('.cs-dialog');
      const lines = await page.$$eval('.cs-dialog ul.cs-changes li', (els) => els.map((el) => el.textContent));
      check(
        `Save lists the ${Object.keys(edits).length + 1} changes (the map too)`,
        lines.length === Object.keys(edits).length + 1 && lines.includes('Map › edited') && lines.some((l) => l.startsWith(`${FIELD_BY_PATH.get(GRAVY).where} › ${FIELD_BY_PATH.get(GRAVY).label}:`)),
        lines,
      );
      await page.fill('#cs-save-note', NOTE);
      await shot('save');
      const reloaded = page.waitForEvent('load', { timeout: 90000 });
      await page.getByRole('button', { name: `Save as version ${next}` }).click();
      await reloaded;
      await booted(page);
      await kit.until(() => window.__COPPER__.studio?.isOpen && document.querySelector('.cs-note[data-note="saved"]') !== null);
      const after = await page.evaluate(() => ({
        note: document.querySelector('.cs-note[data-note="saved"]').textContent,
        version: document.querySelector('.cs-chip[data-revision]').dataset.revision,
        unsaved: document.querySelector('.cs-chip[data-unsaved]').dataset.unsaved,
        revision: window.__COPPER__.tuning().revision,
      }));
      check(
        `after claude.ai reloads the page, the Studio is back: "Saved as version ${next}", nothing unsaved`,
        after.note.startsWith(`Saved as version ${next}. Everyone who opens the game gets it now.`) && after.version === String(next) && after.unsaved === '0' && after.revision === next,
        after,
      );
      // It comes back on the tab it saved from (the Map tab): its picture once the art is drawn again.
      if ((await page.getAttribute('.cs-tab[data-tab="map"]', 'aria-selected')) === 'true') await editorReady(kit);
      await shot('saved');

      published = host.versions[1] ?? '';
      const back = parsePage(published);
      const file = back && JSON.parse(back.tuning);
      check(
        'Save published the page once, as a complete document (the host skeleton around the page)',
        host.versions.length === 2 && published.startsWith('<!doctype html>') && published.endsWith('</body></html>'),
        { versions: host.versions.length, start: published.slice(0, 30), end: published.slice(-30) },
      );
      check(
        '...the same game byte for byte (title, style, script): only the tuning inside changed',
        back !== null && back.title === original.title && back.style === original.style && back.script === original.script && published === wrapInHost(buildPageContent({ ...original, tuning: back.tuning })),
      );
      check(
        `...holding balance version ${next}: the values, the note and the map, in its history too`,
        file?.revision === next &&
          Object.entries(edits).every(([path, value]) => getPath(file.values, path) === value) &&
          file.note === NOTE &&
          gridRows(file.map ?? '')[spot.y]?.[spot.x] === 'c' &&
          file.history[0]?.revision === next &&
          file.history[0].note === NOTE &&
          file.history[0].changes.includes('Map › edited'),
        file && { revision: file.revision, values: file.values, note: file.note, history: file.history.map((h) => ({ revision: h.revision, changes: h.changes })) },
      );
      check("...and the note can't end the page's scripts early", (published.match(/<\/script>/gi) ?? []).length === 2);
      check("...the saved map keeps the school's own notes", JSON.stringify(mapNotes(file?.map ?? '')) === JSON.stringify(mapNotes(DEFAULT_MAP.text)), mapNotes(file?.map ?? ''));

      // With a saved version that isn't the shipped values, Undo and Reset go to different places.
      const field = FIELD_BY_PATH.get(GRAVY);
      const savedGravy = edits[GRAVY];
      const shipped = getPath(DEFAULTS, GRAVY);
      const third = [1.25, 1.75, 3].find((v) => v !== savedGravy && v !== shipped);
      await kit.tab('gravy');
      await kit.type(GRAVY, third);
      const status = await kit.status(GRAVY);
      await kit.link(GRAVY, 'Undo');
      const undone = { input: await kit.field(GRAVY).locator('input.cs-num').inputValue(), unsaved: await kit.unsaved(), status: await kit.status(GRAVY) };
      check(
        `with version ${next} saved, a setting's Undo goes back to the saved ${savedGravy} (not the shipped ${shipped})`,
        status.includes(`was ${formatValue(field, savedGravy)}`) && status.includes(`Shipped: ${formatValue(field, shipped)}`) && undone.input === String(savedGravy) && undone.unsaved === 0 && undone.status.includes('Shipped'),
        { status, undone },
      );
      await kit.link(GRAVY, 'Reset');
      const reset = { input: await kit.field(GRAVY).locator('input.cs-num').inputValue(), unsaved: await kit.unsaved(), status: await kit.status(GRAVY) };
      check(`...and Reset to the shipped ${shipped}, an unsaved change from version ${next}`, reset.input === String(shipped) && reset.unsaved === 1 && reset.status.includes(`was ${formatValue(field, savedGravy)}`), reset);
      await kit.link(GRAVY, 'Undo');

      await kit.menu('Exit studio');
      await sceneActive('Menu');
      const label = await screenLabel(page);
      check(`the owner's menu now shows "Balance v${next} · <date>"`, new RegExp(`^Balance v${next} · \\d{1,2} [A-Z][a-z]{2} \\d{4}$`).test(label ?? ''), label);
      await shot('menu-saved');
      check('no console errors (claude.ai, owner)', errors.length === 0, errors);
      await context.close();
    }

    // A tester opens the link: no claude.ai runtime (not signed in), just the published page.
    if (published) {
      const { context, page, errors, G, wait, shot, sceneActive, shiftLength } = await open(
        'published-tester',
        { viewport: { width: 1600, height: 900 } },
        { target: PAGE_URL, setup: hostSetup(host, null) },
      );
      const kit = studioKit(page);
      const got = await page.evaluate(() => ({ claude: typeof window.claude, tuning: window.__COPPER__.tuning(), balance: window.__COPPER__.balance }));
      check(
        `a tester opening the link (no claude.ai runtime) gets balance version ${next} with its values and note`,
        got.claude === 'undefined' && got.tuning.revision === next && got.tuning.note === NOTE && got.balance.shift.lengthSeconds === edits[SHIFT] && got.balance.sleepyCoworker.hushMoney === edits[HUSH],
        { claude: got.claude, revision: got.tuning.revision, note: got.tuning.note, shift: got.balance.shift.lengthSeconds, hush: got.balance.sleepyCoworker.hushMoney },
      );
      const label = await screenLabel(page);
      const buttons = await menuButtons(page);
      check(`...their menu shows "Balance v${next}" to report, and no STUDIO`, (label ?? '').startsWith(`Balance v${next} · `) && !buttons.includes('STUDIO'), { label, buttons });
      await shot('menu');
      await page.keyboard.press('Enter');
      await sceneActive('Game');
      await kit.until(() => window.__COPPER__.game.scene.getScene('Game').elapsed > 0.3);
      const run = await G(`return {
        player: g.player.speed, wantPlayer: R.tilesPerSecond(${edits[DALTON]}) * T, boss: g.boss.chaseSpeed, wantBoss: R.tilesPerSecond(${edits[GRAVY]}) * T,
        pile: g.world.fixtures.some((f) => f.def.id === 'abandoned_copper_pile' && tileOf(f).x === ${spot.x} && tileOf(f).y === ${spot.y}) };`);
      const length = await shiftLength();
      check(
        '...and plays it: the saved speeds, shift length and map',
        approx(run.player, run.wantPlayer) && approx(run.boss, run.wantBoss) && Math.abs(length - edits[SHIFT]) < 0.5 && run.pile,
        { ...run, length },
      );
      await G(`calm(); put(g.player.body, { x: ${spot.x}, y: ${spot.y + 1} });`);
      await wait(0.5);
      await shot('shift');
      await page.evaluate(() => (location.hash = '#studio'));
      await kit.until(READY.studio);
      await kit.until(() => document.querySelector('.cs-note[data-note="readonly"]') !== null);
      await kit.tab('history');
      const history = await page.evaluate(() => {
        const first = document.querySelector('.cs-main .cs-hist');
        return {
          title: first?.querySelector('.cs-hist-ver')?.textContent,
          live: first?.querySelector('.cs-badge')?.textContent ?? null,
          note: first?.querySelector('.cs-hist-note')?.textContent,
          changes: [...(first?.querySelectorAll('.cs-changes li') ?? [])].map((li) => li.textContent),
          saveOff: document.querySelector('.cs-head .cs-btn.is-primary').disabled,
        };
      });
      check(
        `...#studio opens read-only for them, its History showing version ${next} with the note`,
        history.title === `Version ${next}` && history.live === 'Live now' && history.note === NOTE && history.changes.includes('Map › edited') && history.saveOff,
        history,
      );
      await shot('history');
      check('no console errors (claude.ai, tester)', errors.length === 0, errors);
      await context.close();
    }

    // A signed-in viewer who may not edit the page (claude.ai's canEdit() is false).
    {
      const { context, page, errors, shot, sceneActive } = await open(
        'published-viewer',
        { viewport: { width: 1280, height: 800 } },
        { target: `${PAGE_URL}#studio`, setup: hostSetup(host, false), ready: 'studio' },
      );
      const kit = studioKit(page);
      await kit.until(() => document.querySelector('.cs-note[data-note="readonly"]') !== null);
      const save = await page.locator('.cs-head .cs-btn.is-primary').evaluate((b) => ({ disabled: b.disabled, title: b.title }));
      const note = await page.locator('.cs-note[data-note="readonly"]').textContent();
      check("a viewer who can't edit the page gets a read-only Studio: Save off, saying who can save", save.disabled && /owner/.test(save.title) && /Export/.test(note), { save, note });
      await shot('studio');
      await kit.menu('Exit studio');
      await sceneActive('Menu');
      check('...and no STUDIO on their menu', !(await menuButtons(page)).includes('STUDIO'), await menuButtons(page));
      check('no console errors (claude.ai, viewer)', errors.length === 0, errors);
      await context.close();
    }

    // ---- (e) the Studio on a phone held upright, with touch -------------------------------------------
    {
      const { context, page, errors, G, wait, shot, sceneActive, buttonPos } = await open(
        'studio-phone',
        { ...devices['iPhone 13'], deviceScaleFactor: 2, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } },
        { target: PAGE_URL, setup: hostSetup(host, true) },
      );
      const kit = studioKit(page, { touch: true });
      const offered = await kit.holds(() => window.__COPPER__.game.scene.getScene('Menu').children.list.some((o) => o.label?.text === 'STUDIO'), null, 60000);
      await shot('menu');
      if (offered) {
        const at = await buttonPos('Menu', 'STUDIO');
        await page.touchscreen.tap(at.x, at.y);
      }
      check('phone held upright: tapping STUDIO on the menu opens the Studio', offered && (await kit.holds(READY.studio, null, 90000)));
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);

      for (const id of [...SECTIONS.map((s) => s.id), 'map', 'history']) {
        await kit.tab(id);
        if (id === 'map') await editorReady(kit, 90000);
        const fit = await sideways(page);
        const fits = fit.page <= 0 && fit.main <= 0 && fit.out.length === 0;
        if (id === 'map') {
          const placed = await page.evaluate(() => {
            const a = window.__COPPER__.game.canvas.getBoundingClientRect();
            const b = document.querySelector('.cs-maphost').getBoundingClientRect();
            return [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].every((d) => Math.abs(d) <= 1) && a.right <= innerWidth + 1;
          });
          check('phone: the Map tab shows the map editor under the header, nothing sideways', fits && placed, fit);
        } else if (id === 'history') {
          check('phone: the History tab fits the screen', fits && (await page.locator('.cs-main .cs-hist').count()) > 0, fit);
        } else {
          const want = sectionFields(id).length;
          const shown = await page.locator('.cs-main .cs-field').count();
          check(`phone: the ${SECTIONS.find((s) => s.id === id).title} tab shows its ${want} settings with nothing sticking out sideways`, fits && shown === want, { fit, shown, want });
        }
        if (['crew', 'gravy', 'map', 'history'].includes(id)) await shot(id);
      }

      // Typing a value (with the phone's number pad).
      const savedGravy = edits[GRAVY];
      const phoneGravy = other(savedGravy, 1.25, 1.75);
      await kit.tab('gravy');
      await kit.type(GRAVY, phoneGravy);
      check(`phone: typing ${phoneGravy} for Mr. Gravy's speed changes the draft`, (await draftValue(kit, GRAVY)) === phoneGravy && (await kit.unsaved()) === 1);

      // A swipe that starts on a slider scrolls the page and never changes the value.
      await kit.tab('loot');
      const cdp = await context.newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      const drag = async (from, dx, dy, steps = 10) => {
        await touch('touchStart', from.x, from.y);
        for (let i = 1; i <= steps; i++) await touch('touchMove', from.x + (dx * i) / steps, from.y + (dy * i) / steps);
        await touch('touchEnd');
      };
      const sliderAt = () =>
        page.evaluate(() => {
          // A slider in the middle of the screen, where a thumb starts scrolling.
          const track = [...document.querySelectorAll('.cs-main .cs-track')].find((t) => {
            const r = t.getBoundingClientRect();
            return r.top > innerHeight * 0.35 && r.bottom < innerHeight * 0.75;
          });
          if (!track) return null;
          const r = track.getBoundingClientRect();
          const slider = track.querySelector('.cs-slider');
          return {
            path: track.closest('.cs-field').dataset.path,
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            left: r.left,
            width: slider.getBoundingClientRect().width,
            min: Number(slider.min),
            max: Number(slider.max),
            from: Number(slider.value),
          };
        });
      const valuesBefore = JSON.stringify((await kit.snapshot()).draft.values);
      const top0 = await page.locator('.cs-main').evaluate((m) => m.scrollTop);
      const slider = await sliderAt();
      if (slider) await drag(slider, 0, -320);
      const scrolled = await kit.holds((top0) => document.querySelector('.cs-main').scrollTop > top0 + 100, top0, 10000);
      check(
        'phone: a swipe that starts on a slider scrolls the page and leaves the value alone',
        coarse && slider !== null && scrolled && JSON.stringify((await kit.snapshot()).draft.values) === valuesBefore,
        { coarse, slider, top: await page.locator('.cs-main').evaluate((m) => m.scrollTop) },
      );
      // ...while dragging sideways along one moves it, from where it was (towards the roomier end).
      const across = await sliderAt();
      const way = across && across.from > (across.min + across.max) / 2 ? -1 : 1;
      if (across) await drag({ x: across.left + across.width * (way > 0 ? 0.3 : 0.7), y: across.y }, way * across.width * 0.25, 0);
      const field = across && FIELD_BY_PATH.get(across.path);
      const scale = field?.kind.percent ? 100 : 1;
      const want = field && checkValue(field, Math.min(across.max, Math.max(across.min, across.from + way * 0.25 * (across.max - across.min))) / scale).value;
      const moved = across !== null && (await kit.holds(([path, from]) => {
        const slider = document.querySelector(`.cs-field[data-path="${path}"] .cs-slider`);
        return Number(slider.value) !== from;
      }, [across.path, across.from], 10000));
      const got = across && (await draftValue(kit, across.path));
      const step = field?.kind.step ?? 0;
      check(
        'phone: dragging sideways along a slider moves it, from where it was',
        moved && typeof got === 'number' && Math.abs(got - want) <= step + 1e-9,
        { across, got, want },
      );
      if (across) await kit.link(across.path, 'Undo');

      // Play test with touch: the touch controls, the draft, and ◀ STUDIO.
      await kit.tab('gravy');
      await kit.press(page.locator('.cs-play .cs-btn'));
      await sceneActive('Game');
      await kit.until(() => window.__COPPER__.game.scene.getScene('Game').elapsed > 0.5 && window.__COPPER__.game.registry.get('hud:layout'), null, 180000);
      const run = await G(`return { touch: h.touch, boss: g.boss.chaseSpeed, want: R.tilesPerSecond(${phoneGravy}) * T };`);
      const back = await backButton(page);
      check('phone: Play test runs the draft with the touch controls, ◀ STUDIO clear of the HUD', run.touch && approx(run.boss, run.want) && back.visible && back.hits.length === 0, { run, back });
      await G('calm(); put(g.player.body, openRow(6));');
      await wait(0.3);
      const x0 = await G('return g.player.x;');
      await touch('touchStart', 90, 600);
      for (let i = 1; i <= 8; i++) await touch('touchMove', 90 + i * 10, 600);
      await wait(1);
      await shot('playtest');
      await touch('touchEnd');
      const x1 = await G('return g.player.x;');
      check('...dragging the joystick walks Dalton', x1 - x0 > T, { x0, x1 });
      await page.locator('.cs-back').tap();
      await kit.until(() => window.__COPPER__.studio.isOpen, null, 60000);
      check('phone: ◀ STUDIO comes back to the Studio, the draft kept', (await kit.unsaved()) === 1);
      await kit.menu('Exit studio');
      await sceneActive('Menu');
      check('no console errors (studio, phone)', errors.length === 0, errors);
      await context.close();
    }
  }
}

// ---- phone: touch controls ------------------------------------------------------------------
if (runs('phone')) {
  const { context, page, errors, G, waitFor, wait, shot, sceneActive, buttonPos, hudToScreen } = await open('phone', {
    ...devices['iPhone 13 landscape'],
    deviceScaleFactor: 2,
  });
  await page.waitForTimeout(600);
  await shot('menu');
  const start = await buttonPos('Menu', 'START SHIFT');
  await page.touchscreen.tap(start.x, start.y);
  await sceneActive('Game');
  await wait(0.5);
  await G('calm();');
  // Phones zoom in, but only so far: a tile stays within the camera's size limits (src/config/balance.ts).
  const TILE_CSS = 'T * g.cameras.main.zoom * g.scale.canvasBounds.width / g.scale.width';
  const tileFits = `(${TILE_CSS}) >= B.camera.minTileCssPx - 0.5 && (${TILE_CSS}) <= B.camera.maxTileCssPx + 0.5`;
  check('phone gets touch controls and a zoomed camera', await waitFor(`h.touch && g.cameras.main.zoom > 1 && ${tileFits}`, 1), await G(`return { touch: h.touch, zoom: g.cameras.main.zoom, tileCss: ${TILE_CSS.replace(/T \*/, '64 *')} };`));

  // Somewhere with open floor to the east to walk into.
  await G('const r = openRow(6); put(g.player.body, r);');
  await wait(0.5);
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const x0 = await G('return g.player.x;');
  await touch('touchStart', 120, 260);
  for (let i = 1; i <= 8; i++) await touch('touchMove', 120 + i * 10, 260);
  await wait(1);
  await shot('joystick');
  await touch('touchEnd');
  check('dragging the joystick moves Dalton', (await G('return g.player.x;')) - x0 > T, { x0, x1: await G('return g.player.x;') });

  const zone = async (name) => {
    const z = await G(`return { x: h.${name}.x, y: h.${name}.y };`);
    return hudToScreen(z.x, z.y);
  };
  await G("standBy('drinking_fountain');");
  await wait(0.3);
  check('action button reads SCRAP next to a fixture', (await G('return g.hud.action;')) === 'SCRAP');
  const action = await zone('actionZone');
  await page.touchscreen.tap(action.x, action.y);
  await wait(0.4);
  check('tapping the action button scraps', (await G('return g.player.channel?.kind;')) === 'scrap');
  await shot('scrapping');
  check('scrap lands in the bag', await waitFor('g.player.bag.total === 1', 5));

  const ability = await zone('abilityZone');
  await page.touchscreen.tap(ability.x, ability.y);
  await wait(0.2);
  check('HIDE button triggers the disguise', await G('return g.player.disguised;'));

  // The sleepy coworker's dialog and the HIGH ALERT banner fit around the touch controls.
  await G('g.raiseAlarm(); g.wakeSleepyCoworker();');
  check('dialog box opens on the phone', await waitFor('h.dialog.open', 6));
  await wait(1);
  await shot('dialog-alert');
  const box = await G('return h.dialogBox;');
  const buttons = await G('return [h.actionZone, h.abilityZone].map((z) => ({ x: z.x - z.width / 2, y: z.y - z.height / 2, w: z.width, h: z.height }));');
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  check('...clear of the touch buttons', buttons.every((b) => !overlaps(box, b)), { box, buttons });
  check('no console errors (phone)', errors.length === 0, errors);
  await context.close();
}

// ---- phone held upright: portrait layout -----------------------------------------------------
if (runs('portrait')) {
  const { context, page, errors, G, waitFor, wait, shot, sceneActive, buttonPos, hudToScreen, endShift } = await open('portrait', {
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
  });
  await page.waitForTimeout(600);
  await shot('menu');
  const start = await buttonPos('Menu', 'START SHIFT');
  await page.touchscreen.tap(start.x, start.y);
  await sceneActive('Game');
  await G('calm();');
  await G("standBy('drinking_fountain');");
  await wait(1.5);
  await shot('game');
  const TILE_CSS = 'T * g.cameras.main.zoom * g.scale.canvasBounds.width / g.scale.width';
  check(
    'portrait: zoomed camera, larger HUD, scrap prompt',
    await waitFor(`g.cameras.main.zoom > 1 && (${TILE_CSS}) >= B.camera.minTileCssPx - 0.5 && (${TILE_CSS}) <= B.camera.maxTileCssPx + 0.5 && h.ui > 2 && g.hud.action === 'SCRAP'`, 1),
    await G(`return { zoom: g.cameras.main.zoom, tileCss: ${TILE_CSS.replace(/T \*/, '64 *')}, ui: h.ui, action: g.hud.action };`),
  );

  // A tap on the dialog box finishes the typing, a second tap closes it.
  await G("g.dialog({ speaker: 'Test', text: 'A long line to read on a phone held upright, typed out a letter at a time.', seconds: 60 });");
  check('a dialog line opens', await waitFor('h.dialog.open', 2));
  const box = await G('return h.dialogBox;');
  const mid = await hudToScreen(box.x + box.w / 2, box.y + box.h / 2);
  await page.touchscreen.tap(mid.x, mid.y);
  check('tapping the dialog box types the line out', await waitFor('h.dialog.update(h.dialogClock)?.typed', 1));
  await wait(0.3);
  await shot('dialog');
  await page.touchscreen.tap(mid.x, mid.y);
  check('...and a second tap closes it', await waitFor('!h.dialog.open', 1));
  // While the box is up the action button reads NEXT; once it closes Dalton should still be by the fountain.
  check("...without moving Dalton (it isn't the joystick)", await waitFor('g.hud.action === "SCRAP"', 1), await G('return { action: g.hud.action, prompt: g.hud.prompt, x: g.player.x, y: g.player.y };'));

  await endShift();
  await shot('shift-over');
  check('no console errors (portrait)', errors.length === 0, errors);
  await context.close();
}

await browser.close();
await server?.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll e2e checks passed. Screenshots in .smoke/');
process.exit(failed ? 1 : 0);
