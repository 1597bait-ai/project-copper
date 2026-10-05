// End-to-end check in a real (headless) browser. Plays through the core rules on a desktop
// screen and the touch controls on a phone screen, saving screenshots to .smoke/.
//
//   npm run build && npm run e2e
//
// Uses debug access via window.__COPPER__ to teleport the player around.

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
  /** Run code with g = Game scene, h = Hud scene, gm = Phaser.Game. */
  const G = (src) =>
    page.evaluate((src) => {
      const gm = window.__COPPER__.game;
      return new Function('g', 'h', 'gm', src)(gm.scene.getScene('Game'), gm.scene.getScene('Hud'), gm);
    }, src);
  /** Wait for N seconds of in-game time (the game clock, not wall time). */
  const wait = async (seconds) => {
    const e0 = await G('return g.elapsed;');
    await page.waitForFunction(
      ([e0, s]) => {
        const g = window.__COPPER__.game.scene.getScene('Game');
        return !g.sys.isActive() || g.elapsed - e0 >= s;
      },
      [e0, seconds],
      { timeout: 120000, polling: 50 },
    );
  };
  const tap = async (key) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(80);
    await page.keyboard.up(key);
  };
  const shot = (file) => page.screenshot({ path: `${OUT}/${name}-${file}.png` });
  const sceneActive = (key) => page.waitForFunction((k) => window.__COPPER__.game.scene.isActive(k), key, { timeout: 30000 });
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
  return { context, page, errors, G, wait, tap, shot, sceneActive, standBy };
}

// ---- desktop: the rules -------------------------------------------------------------
{
  const { context, page, errors, G, wait, tap, shot, sceneActive } = await open('desktop', { viewport: { width: 1600, height: 900 } });
  await shot('menu');
  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.5);
  await shot('start');
  await G('g.boss.grace = 9999;'); // keep Mr. Gravy out of the economy checks

  await G(`g.player.body.reset(${21.5 * T}, ${11.5 * T});`);
  await wait(0.2);
  check('prompt offers the drinking fountain', (await G('return g.hud.prompt;'))?.includes('Drinking Fountain'));
  await tap('e');
  await wait(0.3);
  check('scrapping takes ~3.56s for Dalton (repair 2 + 0.25)', Math.abs((await G('return g.player.channel?.duration;')) - 3.556) < 0.01);
  check('scrapping counts as suspicious', await G('return g.player.suspicious;'));
  await shot('scrapping');
  await wait(3.4);
  check('fountain gives 1.0 copper and goes on recharge', await G(`return g.player.bag.total === 1 && !g.world.fixtures.find(f => f.def.id === 'drinking_fountain').ready;`));

  await G(`g.player.body.reset(${5 * T}, ${13.5 * T});`);
  await wait(0.3);
  check('van sells 1.0 copper for $10', await G('return g.hud.money === 10 && g.player.bag.isEmpty;'));

  await G(`g.player.body.reset(${8.5 * T}, ${12.5 * T}); g.player.bag.add('steel', 5);`);
  check('bag stops at capacity 2', await G('return g.player.bag.total === 2 && g.player.bag.isFull;'));

  await tap('q');
  await wait(0.2);
  check('disguise hides carried scrap', await G('return g.player.disguised && !g.player.suspicious;'));
  await wait(5.2);
  check('disguise wears off after 5s', await G('return !g.player.disguised && g.player.suspicious;'));

  // Stand in front of Mr. Gravy with scrap.
  await G(`g.boss.grace = 0; g.boss.state = 'pause'; g.boss.timer = 10; g.boss.lookBase = 0; g.boss.lookT = 0; g.boss.facing = 0;
           g.boss.body.reset(${25.5 * T}, ${11.5 * T}); g.player.body.reset(${28 * T}, ${11.5 * T});`);
  await wait(0.5);
  await shot('spotted');
  await wait(1.5);
  check('getting caught = warning 1 and scrap confiscated', await G('return g.hud.warnings === 1 && g.player.bag.isEmpty;'));

  await G(`g.player.body.reset(${8 * T}, ${12.5 * T}); g.boss.timer = 0.1;`);
  await wait(0.3);
  const p0 = await G('return [g.boss.x, g.boss.y];');
  await wait(3);
  const p1 = await G('return [g.boss.x, g.boss.y];');
  check('Mr. Gravy walks his patrol', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > T, { p0, p1 });

  await G(`g.boss.grace = 9999; g.player.body.reset(${42.5 * T}, ${12.4 * T});`);
  await wait(0.2);
  check('boiler room door offers unlock', (await G('return g.hud.prompt;'))?.startsWith('Unlock'));
  await tap('e');
  await wait(3.3);
  check('door unlocks and stops blocking', await G('const d = g.world.doors[0]; return !d.locked && !g.world.nav.blocked(42, 13) && !g.world.sight.blocked(42, 13);'));

  await G(`g.player.body.reset(${43.5 * T}, ${18.5 * T});`);
  await wait(0.2);
  check('boiler room copper pile is in reach', await G(`return g.hud.location === 'Boiler Room' && g.hud.prompt.includes('Copper Pile');`));
  await tap('e');
  await wait(1.6);
  check('copper pile gives 1.5', await G('return g.player.bag.total === 1.5;'));
  await shot('boiler');

  await G('g.elapsed = 119.5;');
  await wait(0.8);
  check('Mr. Gravy speeds up at half shift', await G('return g.boss.speedMultiplier === 1.2;'));

  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc pauses', await page.evaluate(() => window.__COPPER__.game.scene.isPaused('Game')));
  await shot('paused');
  await tap('Escape');
  await page.waitForTimeout(500);
  check('Esc resumes', await page.evaluate(() => window.__COPPER__.game.scene.isActive('Game')));

  await G('g.elapsed = 239.8;');
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('shift-over');
  check('shift ends at 3:00 PM', true);

  await page.keyboard.press('Enter');
  await sceneActive('Game');
  await wait(0.3);
  await G(`g.warnings = 2; g.player.bag.add('copper', 1); g.boss.grace = 0; g.boss.state = 'pause'; g.boss.timer = 10;
           g.boss.lookBase = 0; g.boss.lookT = 0; g.boss.facing = 0;
           g.boss.body.reset(${25.5 * T}, ${11.5 * T}); g.player.body.reset(${27 * T}, ${11.5 * T});`);
  await sceneActive('ShiftEnd');
  await page.waitForTimeout(600);
  await shot('fired');
  check('third warning = fired', await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').summary.fired));

  // Tomothy: "Act Like You're Working" makes scrapping look legit.
  await page.evaluate(() => window.__COPPER__.game.scene.getScene('ShiftEnd').scene.start('Game', { character: 'tomothy' }));
  await sceneActive('Game');
  await wait(0.3);
  await G(`g.boss.grace = 9999; g.player.body.reset(${21.5 * T}, ${11.5 * T});`);
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

// ---- phone: touch controls ------------------------------------------------------------
{
  const { context, page, errors, G, wait, shot, sceneActive } = await open('phone', { ...devices['iPhone 13 landscape'], deviceScaleFactor: 2 });
  await shot('menu');
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width / 2, vp.height * 0.86);
  await sceneActive('Game');
  await wait(0.5);
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
  await G(`g.boss.grace = 9999; g.player.body.reset(${21.5 * T}, ${11.5 * T});`);
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

// ---- phone held upright: portrait layout -----------------------------------------------
{
  const { context, page, errors, G, wait, shot, sceneActive } = await open('portrait', { ...devices['iPhone 13'], deviceScaleFactor: 2 });
  await shot('menu');
  // The menu camera is zoomed in portrait, so convert the button's world position to the screen.
  const start = await page.evaluate(() => {
    const gm = window.__COPPER__.game;
    const menu = gm.scene.getScene('Menu');
    const btn = menu.children.list.find((o) => o.label?.text === 'START SHIFT');
    const cam = menu.cameras.main;
    const r = gm.canvas.getBoundingClientRect();
    const k = r.width / gm.scale.width;
    return { x: r.left + (btn.x - cam.worldView.x) * cam.zoom * k, y: r.top + (btn.y - cam.worldView.y) * cam.zoom * k };
  });
  await page.touchscreen.tap(start.x, start.y);
  await sceneActive('Game');
  await G(`g.boss.grace = 9999; g.player.body.reset(${21.5 * T}, ${11.5 * T});`);
  await wait(1.5);
  await shot('game');
  check('portrait: zoomed camera, larger HUD, scrap prompt', await G(`return g.cameras.main.zoom > 2 && h.ui > 2 && g.hud.action === 'SCRAP';`));
  await G('g.elapsed = 239.9;');
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
