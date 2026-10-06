// End-to-end check in a real (headless) browser. Plays through the core rules, the students and
// the map editor on a desktop screen, then the touch controls on phones held sideways and upright.
// Saves screenshots to .smoke/.
//
//   npm run build && npm run e2e
//
// Uses debug access via window.__COPPER__ to teleport people around. Positions come from the map
// (fixtures are found by type), so the checks keep working when the map is edited.

import { chromium, devices } from 'playwright';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const OUT = '.smoke';
const T = 64;
await mkdir(OUT, { recursive: true });
const server = await preview({ preview: { port: 4317 }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;

const check = (label, cond, info) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`, cond ? '' : JSON.stringify(info ?? ''));
  if (!cond) failed++;
};

async function open(name, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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

  /** Run code with g = Game scene, h = Hud scene, gm = Phaser.Game, ed = Editor scene. */
  const G = (src) =>
    page.evaluate((src) => {
      const gm = window.__COPPER__.game;
      const s = (k) => gm.scene.getScene(k);
      return new Function('g', 'h', 'gm', 'ed', src)(s('Game'), s('Hud'), gm, s('Editor'));
    }, src);

  /** Wait until `cond` (an expression using g) holds, or `max` seconds of in-game time pass. Returns whether it held. */
  const waitFor = async (cond, max = 120) => {
    const e0 = await G('return g.elapsed;');
    const handle = await page.waitForFunction(
      ([e0, max, cond]) => {
        const g = window.__COPPER__.game.scene.getScene('Game');
        if (!g.sys.isActive()) return 'stopped';
        if (new Function('g', `return (${cond});`)(g)) return 'met';
        return g.elapsed - e0 >= max ? 'timeout' : false;
      },
      [e0, max, cond],
      { timeout: 300000, polling: 30 },
    );
    return (await handle.jsonValue()) === 'met';
  };
  /** Wait for N seconds of in-game time (the game clock, not wall time; headless rendering is slow). */
  const wait = (seconds) => waitFor('false', seconds);

  const tap = async (key) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
  };
  const shot = (file) => page.screenshot({ path: `${OUT}/${name}-${file}.png` });
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

  /**
   * Teleports the player onto a walkable tile next to the fixture of this id nearest to tile (nearX, nearY),
   * and returns that fixture's tile. Works on any map, so the checks don't depend on the layout.
   */
  const standBy = (id, nearX = 0, nearY = 0) =>
    G(`const T = 64;
       const fs = g.world.fixtures.filter((f) => f.def.id === '${id}');
       fs.sort((a, b) => Math.hypot(a.x / T - ${nearX}, a.y / T - ${nearY}) - Math.hypot(b.x / T - ${nearX}, b.y / T - ${nearY}));
       const f = fs[0];
       const tx = Math.floor(f.x / T), ty = Math.floor(f.y / T);
       const spot = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => !g.world.nav.blocked(tx + dx, ty + dy));
       g.player.body.reset((tx + spot[0] + 0.5) * T, (ty + spot[1] + 0.5) * T);
       return { x: tx, y: ty };`);
  /** Mr. Gravy stops catching (and taking reports) and students stop noticing, for checks about something else. */
  const calm = () => G('g.boss.grace = 9999; for (const s of g.students) s.ignore = 9999;');
  /** Mr. Gravy stands at tile (x, y) looking east (angle 0) until told otherwise. */
  const parkBoss = (x, y) =>
    G(`g.boss.grace = 0; g.boss.state = 'pause'; g.boss.timer = 9999; g.boss.lookBase = 0; g.boss.lookT = 0; g.boss.facing = 0;
       g.boss.body.reset(${(x + 0.5) * T}, ${(y + 0.5) * T});`);
  const shiftLength = () => G('return g.elapsed / g.hud.progress;');

  return { context, page, errors, G, waitFor, wait, tap, shot, sceneActive, toScreen, buttonPos, click, standBy, calm, parkBoss, shiftLength };
}

// ---- desktop: the rules ---------------------------------------------------------------
{
  const { context, page, errors, G, waitFor, wait, tap, shot, sceneActive, standBy, calm, parkBoss, shiftLength } = await open('desktop', {
    viewport: { width: 1600, height: 900 },
  });
  await shot('menu');
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.5);
  await shot('start');
  check('the map is square, with 4 students', await G('return g.world.map.width === g.world.map.height && g.students.length === 4;'));
  await calm();

  await standBy('drinking_fountain', 24, 23);
  await wait(0.2);
  check('prompt offers the drinking fountain', (await G('return g.hud.prompt;'))?.includes('Drinking Fountain'));
  await tap('e');
  await wait(0.3);
  check('scrapping takes ~3.56s for Dalton (repair 2 + 0.25)', Math.abs((await G('return g.player.channel?.duration;')) - 3.556) < 0.01);
  check('scrapping counts as suspicious', await G('return g.player.suspicious;'));
  await shot('scrapping');
  await wait(3.4);
  check('fountain gives 1.0 copper', await G('return g.player.bag.total === 1;'));

  await G('const v = g.world.van.rect; g.player.body.reset(v.centerX, v.top - 20);');
  await wait(0.3);
  check('van sells 1.0 copper for $10', await G('return g.hud.money === 10 && g.player.bag.isEmpty;'));

  await G(`g.player.body.reset(${24.5 * T}, ${36.5 * T}); g.player.bag.add('steel', 5);`);
  check('bag stops at capacity 2', await G('return g.player.bag.total === 2 && g.player.bag.isFull;'));
  await tap('q');
  await wait(0.2);
  check('disguise hides carried scrap', await G('return g.player.disguised && !g.player.suspicious;'));
  await wait(5.2);
  check('disguise wears off after 5s', await G('return !g.player.disguised && g.player.suspicious;'));

  // North hallway: Mr. Gravy looking east, Dalton 2.5 tiles in front of him with steel in the bag.
  await parkBoss(15, 12);
  await G(`g.player.body.reset(${18 * T}, ${12.5 * T});`);
  await wait(0.5);
  await shot('spotted');
  check('getting caught = warning 1 and scrap confiscated', await waitFor('g.hud.warnings === 1', 3));
  check('...and the bag is empty', await G('return g.player.bag.isEmpty;'));

  await calm();
  await G(`g.player.body.reset(${24.5 * T}, ${44.5 * T}); g.boss.timer = 0.1;`);
  await wait(0.3);
  const p0 = await G('return [g.boss.x, g.boss.y];');
  await wait(3);
  const p1 = await G('return [g.boss.x, g.boss.y];');
  check('Mr. Gravy walks his patrol', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > T, { p0, p1 });

  // The boiler room: locked, at the back of the building.
  await G(`g.player.body.reset(${13.5 * T}, ${11.4 * T});`);
  await wait(0.2);
  check('boiler room door offers unlock', (await G('return g.hud.prompt;'))?.startsWith('Unlock'));
  await tap('e');
  await wait(3.3);
  check('door unlocks and stops blocking', await G('return !g.world.doors[0].locked && !g.world.nav.blocked(13, 10) && !g.world.sight.blocked(13, 10);'));
  await standBy('abandoned_copper_pile', 8, 4);
  await wait(0.2);
  check('boiler room copper pile is in reach', await G(`return g.hud.location === 'Boiler Room' && g.hud.prompt.includes('Copper Pile');`));
  await tap('e');
  await wait(1.6);
  check('copper pile gives 1.5', await G('return g.player.bag.total === 1.5;'));
  await shot('boiler');

  const len = await shiftLength();
  await G(`g.elapsed = ${len / 2 - 0.5};`);
  await wait(0.8);
  check('Mr. Gravy speeds up at half shift', await G('return g.boss.speedMultiplier === 1.2;'));

  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc pauses', await page.evaluate(() => window.__COPPER__.game.scene.isPaused('Game')));
  await shot('paused');
  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc resumes', await page.evaluate(() => window.__COPPER__.game.scene.isActive('Game')));

  await G(`g.elapsed = ${len - 0.2};`);
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('shift-over');
  check('shift ends at 3:00 PM', true);

  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await G('for (const s of g.students) s.ignore = 9999;');
  await parkBoss(15, 12);
  await G(`g.warnings = 2; g.player.bag.add('copper', 1); g.player.body.reset(${17 * T}, ${12.5 * T});`);
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('fired');
  check('third warning = fired', await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').summary.fired));

  // Tomothy: "Act Like You're Working" makes scrapping look legit.
  await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').scene.start('Game', { character: 'tomothy' }));
  await sceneActive('Game');
  await wait(0.3);
  await calm();
  await standBy('drinking_fountain', 24, 23);
  await wait(0.2);
  await tap('q');
  await wait(0.1);
  await tap('e');
  await wait(0.3);
  check('Tomothy scraps faster (repair 3 + 0.5 plumbing bonus)', Math.abs((await G('return g.player.channel?.duration;')) - (4 * 2) / 3.5) < 0.01);
  check("Tomothy's ability hides scrapping", await G('return g.player.isScrapping && g.player.lookingBusy && !g.player.suspicious;'));
  check('Tomothy carries 3 and walks slower than Dalton', await G('return g.player.bag.capacity === 3 && g.player.speed === 2 * 64;'));

  check('no console errors (desktop)', errors.length === 0, errors);
  await context.close();
}

// ---- desktop: students tell Mr. Gravy, who sprints to where you were seen ---------------------
{
  const { context, page, errors, G, waitFor, wait, shot, sceneActive, parkBoss } = await open('students', { viewport: { width: 1600, height: 900 } });
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);

  // An empty-handed player in plain view is ignored.
  await G(`for (const s of g.students) s.ignore = 9999;
           const s = g.students[0]; s.ignore = 0; s.body.reset(${17.5 * T}, ${24.5 * T}); s.state = 'idle'; s.timer = 9999;
           s.facing = 0; s.lookBase = 0; s.lookT = 0; g.boss.grace = 9999; g.player.body.reset(${19.5 * T}, ${24.5 * T});`);
  await wait(3);
  check('students ignore an empty-handed player', await G("return g.students[0].state === 'idle' && g.students[0].suspicion === 0;"));

  // Now with copper: the student notices, runs to Mr. Gravy (parked in the north hallway) and he sprints over.
  await parkBoss(24, 12);
  await G(`g.boss.grace = 9999; g.player.bag.add('copper', 1); g.events.on('toast', (t) => (window.__toasts = [...(window.__toasts ?? []), t]));`);
  check('student notices the scrap and runs to tell', await waitFor("g.students[0].state === 'tattle'", 5));
  const reportPoint = await G('return g.students[0].reportPoint;');
  // Empty the bag, step away, and let him take reports again, so he responds instead of catching.
  await G(`g.player.bag.takeAll(); g.boss.grace = 0; g.player.body.reset(${24.5 * T}, ${44.5 * T});`);
  await shot('tattling');
  check('Mr. Gravy gets the report and sprints', await waitFor("g.boss.state === 'respond'", 30));
  await shot('responding');
  const sprint = await G('return g.boss.body.speed;');
  check('his sprint is faster than his chase (x1.35)', Math.abs(sprint - 2.6 * T * 1.35) < 1, sprint);
  check('he reaches the spot and searches', await waitFor("g.boss.state === 'search'", 30));
  check('...where the student saw you', await G(`return Math.hypot(g.boss.x - ${reportPoint.x}, g.boss.y - ${reportPoint.y}) < ${T};`));
  const toasts = await G('return window.__toasts ?? [];');
  check('toasts: one for the sighting, one for the sprint', toasts.some((t) => t.includes('telling on you')) && toasts.some((t) => t.includes('sprinting')), toasts);
  check('no console errors (students)', errors.length === 0, errors);
  await context.close();
}

// ---- desktop: map editor ----------------------------------------------------------------------
{
  const { context, page, errors, G, wait, shot, sceneActive, toScreen, buttonPos, click } = await open('editor', { viewport: { width: 1600, height: 900 } });
  await click(await buttonPos('Menu', 'MAP EDITOR'));
  await sceneActive('Editor');
  await page.waitForTimeout(800);
  await shot('open');
  const cell = (x, y) => toScreen('Editor', (x + 0.5) * T, (y + 0.5) * T, 'mapCam');

  // Drag a wall across the south hallway with the real mouse.
  await G("ed.selectTool('#');");
  const a = await cell(6, 36);
  const b = await cell(12, 36);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('dragging paints a wall with no gaps', await G("return ed.rows[36].slice(6, 13) === '#######';"), await G('return ed.rows[36];'));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('undo takes the whole stroke back', await G("return !ed.rows[36].slice(6, 13).includes('#');"));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check('redo puts it back', await G("return ed.rows[36].slice(6, 13) === '#######';"));
  await page.keyboard.press('Control+z');

  // Place an abandoned copper pile and play the edited map.
  await G("ed.selectTool('c');");
  await click(await cell(20, 36));
  await page.waitForTimeout(700);
  check('placed a copper pile', await G("return ed.rows[36][20] === 'c';"));
  check('problems panel says ready to play', await G('return ed.report.errors.length === 0;'), await G('return ed.report.errors;'));
  await shot('edited');
  const play = await G("const b = ed.buttons.find((b) => b.label.text === 'PLAY'); return { x: b.rect.centerX, y: b.rect.centerY };");
  await click(await toScreen('Editor', play.x, play.y, 'uiCam'));
  await sceneActive('Game');
  await wait(0.5);
  check(
    'PLAY starts the game on the edited map',
    await G("return g.world.fixtures.some((f) => f.def.id === 'abandoned_copper_pile' && Math.floor(f.x / 64) === 20 && Math.floor(f.y / 64) === 36);"),
  );
  await G('g.elapsed = g.elapsed / g.hud.progress - 0.2;');
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(500);
  await click(await buttonPos('ShiftEnd', 'EDIT MAP'));
  await sceneActive('Editor');
  await page.waitForTimeout(500);
  check('EDIT MAP after the shift goes back to the same map', await G("return ed.rows[36][20] === 'c';"));
  check('no console errors (editor)', errors.length === 0, errors);
  await context.close();
}

// ---- phone: touch controls ------------------------------------------------------------------
{
  const { context, page, errors, G, wait, shot, sceneActive, buttonPos, standBy, calm } = await open('phone', {
    ...devices['iPhone 13 landscape'],
    deviceScaleFactor: 2,
  });
  await shot('menu');
  const start = await buttonPos('Menu', 'START SHIFT');
  await page.touchscreen.tap(start.x, start.y);
  await sceneActive('Game');
  await wait(0.5);
  await calm();
  check('phone gets touch controls and a zoomed camera', await G('return h.touch && g.cameras.main.zoom > 1.3;'));

  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const x0 = await G('return g.player.x;');
  await touch('touchStart', 120, 260);
  for (let i = 1; i <= 8; i++) await touch('touchMove', 120 + i * 10, 260);
  await wait(1);
  await shot('joystick');
  await touch('touchEnd');
  check('dragging the joystick moves Dalton', (await G('return g.player.x;')) - x0 > T);

  const screenPos = (zone) =>
    G(`const r = gm.canvas.getBoundingClientRect(); const k = r.width / gm.scale.width; return { x: r.left + h.${zone}.x * k, y: r.top + h.${zone}.y * k };`);
  await standBy('drinking_fountain', 24, 23);
  await wait(0.3);
  check('action button reads SCRAP next to a fixture', (await G('return g.hud.action;')) === 'SCRAP');
  const action = await screenPos('actionZone');
  await page.touchscreen.tap(action.x, action.y);
  await wait(0.4);
  check('tapping the action button scraps', (await G('return g.player.channel?.kind;')) === 'scrap');
  await shot('scrapping');
  await wait(3.3);
  check('scrap lands in the bag', (await G('return g.player.bag.total;')) === 1);

  const ability = await screenPos('abilityZone');
  await page.touchscreen.tap(ability.x, ability.y);
  await wait(0.2);
  check('HIDE button triggers the disguise', await G('return g.player.disguised;'));
  check('no console errors (phone)', errors.length === 0, errors);
  await context.close();
}

// ---- phone held upright: portrait layout -----------------------------------------------------
{
  const { context, page, errors, G, wait, shot, sceneActive, buttonPos, standBy, calm, shiftLength } = await open('portrait', {
    ...devices['iPhone 13'],
    deviceScaleFactor: 2,
  });
  await shot('menu');
  const start = await buttonPos('Menu', 'START SHIFT');
  await page.touchscreen.tap(start.x, start.y);
  await sceneActive('Game');
  await calm();
  await standBy('drinking_fountain', 24, 23);
  await wait(1.5);
  await shot('game');
  check('portrait: zoomed camera, larger HUD, scrap prompt', await G(`return g.cameras.main.zoom > 2 && h.ui > 2 && g.hud.action === 'SCRAP';`));
  await G(`g.elapsed = ${(await shiftLength()) - 0.1};`);
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('shift-over');
  check('no console errors (portrait)', errors.length === 0, errors);
  await context.close();
}

await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll e2e checks passed. Screenshots in .smoke/');
process.exit(failed ? 1 : 0);
