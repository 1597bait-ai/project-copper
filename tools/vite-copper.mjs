// Vite plugin for Copper Studio (src/studio/).
//
// - Every build and the dev server put the tuning file (src/config/tuning.json) into the page, as
//   <script type="application/json" id="copper-tuning">, where the game reads it at boot.
// - The dev server (npm run dev) also lets the Studio save straight into the repo: POST
//   /__copper/tuning writes src/config/tuning.json, and the map into src/assets/maps/lincoln.txt.
//   Commit those files to keep the changes. (On claude.ai the Studio republishes the page instead.)

import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_IDS, embedJson } from '../src/studio/page.ts';

const TUNING_FILE = fileURLToPath(new URL('../src/config/tuning.json', import.meta.url));
const MAP_FILE = fileURLToPath(new URL('../src/assets/maps/lincoln.txt', import.meta.url));
const PLACEHOLDER = '<!-- copper-tuning -->';
/** Biggest request body the save endpoint takes (a map is ~4 KB; a tuning file keeps its last 30 saves, maps included). */
const MAX_BODY = 4 * 1024 * 1024;

/** The <script type="application/json" id="copper-tuning"> tag for a tuning file (the repo's by default). */
export function tuningTag(file = TUNING_FILE) {
  const json = readFileSync(file, 'utf8').trim(); // trim() also drops a byte-order mark
  try {
    JSON.parse(json);
  } catch (e) {
    // Most likely a merge conflict: better a failed build than a game that quietly ships without its balance.
    throw new Error(`${file} is not valid JSON (${e instanceof Error ? e.message : e}). Fix it, or put back the committed version.`);
  }
  return `<script type="application/json" id="${PAGE_IDS.tuning}">${embedJson(json)}</script>`;
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

const readJson = (path) => {
  try {
    return JSON.parse(readText(path)?.trim() || 'null');
  } catch {
    return null;
  }
};

/** A map as the repo keeps it: Unix line endings, ending with a newline. */
const repoText = (text) => {
  const unix = text.replace(/\r\n?/g, '\n');
  return unix.endsWith('\n') ? unix : `${unix}\n`;
};

/**
 * What makes `tuning` unusable, in plain English, or null. Its values are then checked with the
 * game's own rules (parseTuning), so the repo only ever gets what the game would play.
 */
function problemWith(tuning) {
  if (!isObject(tuning)) return 'The request has no tuning file.';
  if (tuning.format !== 'copper-tuning') return 'That is not a Copper tuning file (its format should be "copper-tuning").';
  if (!isObject(tuning.values)) return 'The tuning file has no values.';
  if (tuning.map != null && typeof tuning.map !== 'string') return 'The map in the tuning file is not text.';
  if (tuning.history !== undefined && !Array.isArray(tuning.history)) return 'The history in the tuning file is not a list.';
  return null;
}

/**
 * Whether a POST comes from a page on this dev server. Browsers send Origin with every POST, so a
 * page on another site (which could otherwise post a form here) is turned away; tools send none.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    const host = new URL(origin).host;
    return host === req.headers.host || host === req.headers['x-forwarded-host'];
  } catch {
    return false; // "null": a sandboxed frame or a file
  }
}

/** The request body as text. Past `max` bytes it rejects with status 413 and stops keeping it. */
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += bytes.length;
      if (size > max) {
        finish(reject, Object.assign(new Error(`The tuning file is too big for the dev server (over ${Math.round(max / 1024)} KB).`), { status: 413 }));
        req.resume?.(); // let the rest drain without keeping it
        return;
      }
      chunks.push(bytes);
    });
    req.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8')));
    req.on('error', (e) => finish(reject, e));
  });
}

/**
 * The dev server's /__copper/tuning endpoint (exported, with its file paths, for the unit test).
 * GET answers { tuning, map }: that it answers at all tells the Studio it can save here. POST
 * { tuning } checks the file and only then writes it: the map into `mapFile` (ending with a
 * newline), everything else into `tuningFile` with map null. A bad request writes nothing, and
 * neither does a save made from an older version than the repo's (409).
 */
export function tuningEndpoint({ tuningFile, mapFile, loadTuning, maxBody = MAX_BODY }) {
  async function save(req) {
    let text;
    try {
      text = await readBody(req, maxBody);
    } catch (e) {
      return [e.status ?? 400, { error: e.message }];
    }
    let request;
    try {
      request = JSON.parse(text);
    } catch {
      return [400, { error: 'The request is not valid JSON.' }];
    }
    const problem = problemWith(request?.tuning);
    if (problem) return [400, { error: problem }];
    const { parseTuning, stringifyTuning } = await loadTuning();
    // Unknown values are dropped and numbers clamped, exactly as the game does when it loads the file.
    const { file, warnings } = parseTuning(JSON.stringify(request.tuning));
    // Compare-and-set, like publishing on claude.ai: a save is one version on from the repo's, or it
    // was made from an older one (another tab saved, or a pull ran since the page loaded) and would
    // quietly undo those changes.
    const repo = parseTuning(readText(tuningFile)?.trim()).file; // trim() drops a byte-order mark, as tuningTag() does
    if (file.revision !== repo.revision + 1) {
      return [409, { error: `The project's balance changed since this page loaded (another tab saved, or a pull or git checkout): it is at version ${repo.revision} now, and this save was made from version ${file.revision - 1}.` }];
    }
    const written = [];
    if (file.map !== null) {
      // The map lives in its own file in the repo; the tuning file keeps only the numbers.
      writeFileSync(mapFile, repoText(file.map));
      written.push(mapFile);
    }
    writeFileSync(tuningFile, stringifyTuning({ ...file, map: null }));
    written.push(tuningFile);
    return [200, { ok: true, files: written.map((path) => relative(process.cwd(), path)), warnings }];
  }

  return (req, res) => {
    if (req.method === 'GET') return send(res, 200, { tuning: readJson(tuningFile), map: readText(mapFile) });
    if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Only the game page on this dev server may save into the repo.' });
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'Send the tuning file as application/json.' });
    save(req).then(
      ([status, body]) => send(res, status, body),
      (e) => send(res, 500, { error: `Saving failed: ${e instanceof Error ? e.message : e}` }),
    );
  };
}

/** @returns {import('vite').Plugin} */
export function copperTuning({ tuningFile = TUNING_FILE, mapFile = MAP_FILE } = {}) {
  return {
    name: 'copper-tuning',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(PLACEHOLDER)) throw new Error(`index.html needs a ${PLACEHOLDER} placeholder for the tuning file`);
        const tag = tuningTag(tuningFile);
        // A function, so "$&" or "$'" in a note or a line is kept as written (not a replacement pattern).
        return html.replace(PLACEHOLDER, () => tag);
      },
    },
    configureServer(server) {
      server.middlewares.use(
        '/__copper/tuning',
        tuningEndpoint({
          tuningFile,
          mapFile,
          // The game's own rules, loaded through Vite so they are always the current code.
          loadTuning: () => server.ssrLoadModule('/src/config/tuning.ts'),
        }),
      );
    },
  };
}
