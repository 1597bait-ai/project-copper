// Map tools (uses the game's own parser and checker).
//
//   npm run map:check                 check every map in src/assets/maps/ (and how deep the loot is)
//   npm run map:format                rewrite them with the current legend at the top
//                                     (your own // notes are kept; a map with typos is left alone)
//   node tools/map.mjs check some.txt check (or format) specific files

import { createServer } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [command = 'check', ...files] = process.argv.slice(2);
const dir = new URL('../src/assets/maps/', import.meta.url).pathname;
const paths = files.length ? files : (await readdir(dir)).filter((f) => f.endsWith('.txt')).map((f) => join(dir, f));

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { parseMap, serializeMap, legendComment } = await vite.ssrLoadModule('/src/world/mapText.ts');
const legendLines = new Set(legendComment().split('\n'));
const { validateMap, walkGrid } = await vite.ssrLoadModule('/src/world/validate.ts');
const { FIXTURES } = await vite.ssrLoadModule('/src/config/fixtures.ts');
const { MATERIALS } = await vite.ssrLoadModule('/src/config/materials.ts');

/**
 * How far the loot is from the van (walking steps), for the "pays more the deeper you go" rule
 * that `npm test` checks: nothing copper-priced within 12 steps of the van, and the best-priced
 * loot well deeper than the rest.
 */
function lootDepth(map) {
  if (!map.van || !map.fixtures.length) return null;
  const grid = walkGrid(map);
  const dist = new Int32Array(map.width * map.height).fill(-1);
  const queue = [];
  const v = map.van;
  for (let y = v.y - 1; y <= v.y + v.h; y++) {
    for (let x = v.x - 1; x <= v.x + v.w; x++) {
      if (!grid.blocked(x, y)) {
        dist[y * map.width + x] = 0;
        queue.push({ x, y });
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (grid.blocked(nx, ny) || dist[ny * map.width + nx] >= 0) continue;
      dist[ny * map.width + nx] = dist[c.y * map.width + c.x] + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  const steps = (f) => {
    const d = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => dist[(f.y + dy) * map.width + f.x + dx]).filter((n) => n >= 0);
    return d.length ? Math.min(...d) : Infinity;
  };
  const loot = map.fixtures.filter((f) => FIXTURES[f.id]).map((f) => ({ ...f, steps: steps(f), price: MATERIALS[FIXTURES[f.id].material].pricePerUnit }));
  const best = Math.max(...loot.map((f) => f.price));
  const avg = (fs) => (fs.length ? fs.reduce((n, f) => n + f.steps, 0) / fs.length : 0);
  const copper = loot.filter((f) => f.price >= MATERIALS.copper.pricePerUnit).sort((a, b) => a.steps - b.steps)[0];
  return { best: avg(loot.filter((f) => f.price === best)), rest: avg(loot.filter((f) => f.price < best)), copper };
}

let failed = false;
for (const path of paths) {
  const text = await readFile(path, 'utf8');
  const map = parseMap(text);
  const { errors, warnings } = validateMap(map);
  if (command === 'format') {
    if (map.problems.length) {
      // Rewriting would turn typos into hallway floor: fix them first.
      console.log(`NOT formatted ${path}: fix the problems below first`);
    } else {
      const notes = text
        .replace(/^\uFEFF/, '')
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('//') && !legendLines.has(l));
      const legend = legendComment();
      const out = serializeMap(map.rows, map.names).replace(legend, notes.length ? `${legend}\n//\n${notes.join('\n')}` : legend);
      await writeFile(path, out);
      console.log(`formatted ${path}`);
    }
  }
  console.log(
    `${path}: ${map.width}x${map.height}, ${map.fixtures.length} fixtures, ${map.students.length} students, ` +
      `${map.patrol.length} route stops, ${map.doors.length} locked doors, rooms: ${map.rooms.map((r) => r.name).join(', ')}`,
  );
  const depth = errors.length ? null : lootDepth(map);
  if (depth) {
    const c = depth.copper;
    console.log(
      `  loot depth: best-priced loot ${depth.best.toFixed(0)} steps from the van on average, the rest ${depth.rest.toFixed(0)} (keep it over 1.5x)` +
        (c ? `; nearest copper-priced: ${FIXTURES[c.id].name} at ${c.x},${c.y}, ${c.steps} steps (keep it over 12)` : ''),
    );
  }
  for (const e of errors) console.log(`  ERROR    ${e}`);
  for (const w of warnings) console.log(`  warning  ${w}`);
  if (errors.length) failed = true;
}
await vite.close();
process.exit(failed ? 1 : 0);
