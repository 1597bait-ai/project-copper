// Map tools (uses the game's own parser and checker).
//
//   npm run map:check                 check every map in src/assets/maps/
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
const { validateMap } = await vite.ssrLoadModule('/src/world/validate.ts');

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
  for (const e of errors) console.log(`  ERROR    ${e}`);
  for (const w of warnings) console.log(`  warning  ${w}`);
  if (errors.length) failed = true;
}
await vite.close();
process.exit(failed ? 1 : 0);
