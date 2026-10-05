// Rasterizes the SVG tileset to the PNG that Tiled and the game use, plus the app icons.
//   npm run art
// Uses Playwright's Chromium (npx playwright install chromium if you don't have it).

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { tilesetSvg } from './tiles.mjs';

async function render(page, svg, out) {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const el = await page.$('svg');
  await el.screenshot({ path: out, omitBackground: true });
  console.log('wrote', out);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

await render(page, tilesetSvg(), new URL('../src/assets/tiles/school-tiles.png', import.meta.url).pathname);

const icon = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
for (const size of [192, 512]) {
  const sized = icon.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  await render(page, sized, new URL(`../public/icon-${size}.png`, import.meta.url).pathname);
}

await browser.close();
