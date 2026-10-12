// Vite plugin for Copper Studio (src/studio/).
//
// - Every build and the dev server put the tuning file (src/config/tuning.json) into the page, as
//   <script type="application/json" id="copper-tuning">, where the game reads it at boot.
// - The dev server (npm run dev) also lets the Studio save straight into the repo: POST
//   /__copper/tuning writes src/config/tuning.json, and the map into src/assets/maps/lincoln.txt.
//   Commit those files to keep the changes. (On claude.ai the Studio republishes the page instead.)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGE_IDS, embedJson } from '../src/studio/page.ts';

const TUNING_FILE = fileURLToPath(new URL('../src/config/tuning.json', import.meta.url));
const MAP_FILE = fileURLToPath(new URL('../src/assets/maps/lincoln.txt', import.meta.url));
const PLACEHOLDER = '<!-- copper-tuning -->';
/** Biggest request body the save endpoint takes (a map is ~3 KB, a full tuning file ~20 KB). */
const MAX_BODY = 1_000_000;

export function tuningTag() {
  const json = readFileSync(TUNING_FILE, 'utf8').trim();
  return `<script type="application/json" id="${PAGE_IDS.tuning}">${embedJson(json)}</script>`;
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

/** @returns {import('vite').Plugin} */
export function copperTuning() {
  return {
    name: 'copper-tuning',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(PLACEHOLDER)) throw new Error(`index.html needs a ${PLACEHOLDER} placeholder for the tuning file`);
        return html.replace(PLACEHOLDER, tuningTag());
      },
    },
    configureServer(server) {
      server.middlewares.use('/__copper/tuning', (req, res) => {
        if (req.method === 'GET') {
          send(res, 200, { tuning: JSON.parse(readFileSync(TUNING_FILE, 'utf8')), map: readFileSync(MAP_FILE, 'utf8') });
          return;
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_BODY) req.destroy();
        });
        req.on('end', () => {
          try {
            const { tuning } = JSON.parse(body);
            if (!tuning || tuning.format !== 'copper-tuning' || typeof tuning.values !== 'object') throw new Error('not a tuning file');
            const { map, ...rest } = tuning;
            // The map lives in its own file in the repo; the tuning file keeps only the numbers.
            if (typeof map === 'string' && map.trim()) writeFileSync(MAP_FILE, map.endsWith('\n') ? map : `${map}\n`);
            writeFileSync(TUNING_FILE, `${JSON.stringify({ ...rest, map: null }, null, 2)}\n`);
            send(res, 200, { ok: true, files: ['src/config/tuning.json', ...(typeof map === 'string' && map.trim() ? ['src/assets/maps/lincoln.txt'] : [])] });
          } catch (e) {
            send(res, 400, { error: String(e instanceof Error ? e.message : e) });
          }
        });
      });
    },
  };
}
