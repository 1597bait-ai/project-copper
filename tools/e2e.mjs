// End-to-end check in a real (headless) browser. Plays through the core rules, the students, the
// sleepy coworker and the map editor on a desktop screen, then the touch controls on phones held
// sideways and upright. Saves screenshots to .smoke/.
//
//   npm run build && npm run e2e
//   E2E_URL=http://localhost:5173 npm run e2e     (against a running dev server instead)
//   E2E_ONLY=students,editor npm run e2e          (just some parts: desktop, students, coworker, editor, phone, portrait)
//
// Uses debug access via window.__COPPER__ to teleport people around. Every position comes from the
// map and the world at runtime (fixtures by type, open hallway stretches, reachable tiles), and the
// tuning numbers from window.__COPPER__.balance, so the checks keep working when the map or
// src/config/balance.ts is edited.

import { chromium, devices } from 'playwright';
import { preview } from 'vite';
import { mkdir, readdir, rm } from 'node:fs/promises';

const OUT = '.smoke';
const T = 64;
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

// The pixel font comes from Google Fonts. Fetch it once for the whole run (so screenshots show it
// and no page waits on the network); if that fails the game uses its fallback font, which it must
// handle anyway, and the failed request isn't counted as a console error.
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
const fontCache = new Map();
let fontMissing = false;
async function serveFonts(context) {
  await context.route(FONT_HOSTS, async (route) => {
    const key = route.request().url();
    if (!fontCache.has(key)) {
      fontCache.set(
        key,
        route
          .fetch()
          .then(async (r) => (r.ok() ? { status: r.status(), headers: r.headers(), body: await r.body() } : null))
          .catch(() => null),
      );
    }
    const hit = await fontCache.get(key);
    if (hit) return route.fulfill(hit);
    fontMissing = true;
    return route.abort();
  });
}

/**
 * Helpers available to every snippet run in the page (g = Game scene). Tiles are {x, y} in map cells.
 */
const LIB = String.raw`
const T = 64;
const B = window.__COPPER__.balance;
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
`;

async function open(name, contextOptions) {
  // This part's screenshots from earlier runs (so .smoke/ never shows a stale picture).
  for (const f of await readdir(OUT)) if (f.startsWith(`${name}-`)) await rm(`${OUT}/${f}`);
  const context = await browser.newContext(contextOptions);
  await serveFonts(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !FONT_HOSTS.test(m.location().url ?? '') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__COPPER__?.game.scene.isActive('Menu'), null, { timeout: 30000 });
  // Headless windows never have focus, and Phaser slows the clock down for unfocused windows.
  await page.evaluate(() => {
    const loop = window.__COPPER__.game.loop;
    setInterval(() => {
      loop.inFocus = true;
      loop._coolDown = 0;
    }, 50);
  });

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

  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc pauses', await page.evaluate(() => window.__COPPER__.game.scene.isPaused('Game')));
  await shot('paused');
  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc resumes', await page.evaluate(() => window.__COPPER__.game.scene.isActive('Game')));

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
  check('Tomothy carries 3 and walks slower than Dalton', await G('return g.player.bag.capacity === 3 && g.player.speed === B.tilesPerSecond(1) * T;'));

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
  const sprintWant = await G('return B.tilesPerSecond(g.boss.def.speed) * T * g.boss.speedMultiplier * B.boss.sprintFactor;');
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

// ---- desktop: map editor ----------------------------------------------------------------------
if (runs('editor')) {
  const { context, page, errors, G, wait, shot, sceneActive, toScreen, buttonPos, click, endShift } = await open('editor', { viewport: { width: 1600, height: 900 } });
  await click(await buttonPos('Menu', 'MAP EDITOR'));
  await sceneActive('Editor');
  await page.waitForTimeout(800);
  await shot('open');
  const cell = (c) => toScreen('Editor', (c.x + 0.5) * T, (c.y + 0.5) * T, 'mapCam');
  const editor = (src) => G(`const rows = ed.rows; const at = (x, y) => rows[y]?.[x]; ${src}`);

  // Spots found in the map text: a hallway stretch with hallway above and below, two hallway tiles
  // with hallway all around, and open asphalt for a car.
  const spots = await editor(`
    const open = (x, y, ch, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) !== ch) return false; return true; };
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
  await page.waitForTimeout(300);
  const wallRow = `ed.rows[${wall.y}].slice(${wall.x}, ${wall.x + 7})`;
  check('dragging paints a wall with no gaps', await G(`return ${wallRow} === '#######';`), await G(`return ed.rows[${wall.y}];`));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('undo takes the whole stroke back', await G(`return !${wallRow}.includes('#');`));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check('redo puts it back', await G(`return ${wallRow} === '#######';`));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);

  // Place an abandoned copper pile and a plant.
  await G("ed.selectTool('c');");
  await click(await cell(pile));
  await page.waitForTimeout(300);
  check('placed a copper pile', await G(`return ed.rows[${pile.y}][${pile.x}] === 'c';`));
  await G("ed.selectTool('*');");
  await click(await cell(plant));
  await page.waitForTimeout(300);
  check('placed a plant', await G(`return ed.rows[${plant.y}][${plant.x}] === '*';`));

  // A car is stamped whole (2x2, the tapped tile at its top-left) and erased whole.
  const carCells = `[0, 1].flatMap((dy) => [0, 1].map((dx) => ed.rows[${car.y} + dy][${car.x} + dx]))`;
  await G("ed.selectTool('C');");
  await click(await cell(car));
  await page.waitForTimeout(300);
  check('stamps a whole 2x2 car', await G(`return ${carCells}.join('') === 'CCCC';`), await G(`return ${carCells};`));
  await page.waitForTimeout(500);
  await shot('car');
  await G("ed.selectTool('erase');");
  await click(await cell({ x: car.x + 1, y: car.y + 1 }));
  await page.waitForTimeout(300);
  check('erasing one corner of the car removes all of it', await G(`return ${carCells}.join('') === 'pppp';`), await G(`return ${carCells};`));
  await page.waitForTimeout(500);
  check('problems panel says ready to play', await G('return ed.report.errors.length === 0;'), await G('return ed.report.errors;'));
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
  await click(await buttonPos('ShiftEnd', 'EDIT MAP'));
  await sceneActive('Editor');
  await page.waitForTimeout(500);
  check('EDIT MAP after the shift goes back to the same map', await G(`return ed.rows[${pile.y}][${pile.x}] === 'c' && ed.rows[${plant.y}][${plant.x}] === '*';`));
  check('no console errors (editor)', errors.length === 0, errors);
  await context.close();
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
  check('phone gets touch controls and a zoomed camera', await G('return h.touch && g.cameras.main.zoom > 1.3;'));

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
  check('portrait: zoomed camera, larger HUD, scrap prompt', await G(`return g.cameras.main.zoom > 2 && h.ui > 2 && g.hud.action === 'SCRAP';`));

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
  check("...without moving Dalton (it isn't the joystick)", await G('return g.hud.action === "SCRAP";'));

  await endShift();
  await shot('shift-over');
  check('no console errors (portrait)', errors.length === 0, errors);
  await context.close();
}

await browser.close();
await server?.close();
if (fontMissing) console.log('\nNote: Pixelify Sans could not be fetched, so the screenshots use the fallback font.');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll e2e checks passed. Screenshots in .smoke/');
process.exit(failed ? 1 : 0);
