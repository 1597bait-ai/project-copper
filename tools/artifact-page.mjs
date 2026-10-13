// The game page published on claude.ai (an Artifact), and the way back for balance saved there.
//
//   npm run artifact                                  build:single, then build the page
//   node tools/artifact-page.mjs build [--in dist-single/index.html] [--out .tmp-artifact/project-copper.html]
//   node tools/artifact-page.mjs pull <saved-page.html | copper-tuning-v7.json> [--force]
//
// build: the page content the Artifact tool publishes (claude.ai wraps it in its own skeleton), in
// the format of src/studio/page.ts: the title, the style, the repo's tuning file and the whole game
// as one module script. Publish it declaring the capabilities it prints, so that Copper Studio can
// save into the page (it republishes itself with the new tuning inside).
//
// pull: balance saved in Copper Studio on claude.ai lives in the published page. Before the code is
// published again (which replaces that page), pull it into the repo: its values and history into
// src/config/tuning.json, its map into src/assets/maps/lincoln.txt. Claude can fetch the published
// page to a file (the Artifact tool's read); a saved version exported from the Studio works too
// (Export with no unsaved changes), but an exported draft doesn't. Refuses anything else, and
// balance that would lose the repo's: older than it, or saved apart from it (on the dev server, say)
// rather than on top of it (unless --force).
//
// The functions are exported for the e2e suite, which builds the page in-process.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_CAPABILITIES, buildPageContent, parsePage } from '../src/studio/page.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILES = {
  build: 'dist-single/index.html',
  page: '.tmp-artifact/project-copper.html',
  tuning: 'src/config/tuning.json',
  map: 'src/assets/maps/lincoln.txt',
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const decodeEntities = (text) => text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, name) => ENTITIES[name]);

/** A map as the repo keeps it: Unix line endings, ending with a newline. */
const repoText = (text) => {
  const unix = text.replace(/\r\n?/g, '\n');
  return unix.endsWith('\n') ? unix : `${unix}\n`;
};

/**
 * The parts of the single-file build (dist-single/index.html) the page is made of: its title, the
 * CSS of <style id="copper-style"> and the one inline module script, which is the whole game.
 * Throws when one is missing, doubled, or the build has something the page can't carry, so a
 * changed build never quietly makes a broken page.
 */
export function extractBuildParts(html) {
  // Scripts and comments first, in document order, so that "<title>" or "<style>" in the game's
  // strings (an SVG icon, say) or a "<script>" in a comment is never taken for the real thing.
  const scripts = [];
  const markup = html.replace(/<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_, attrs, body) => {
    if (attrs === undefined) return ''; // a comment
    if (!/\bid="copper-tuning"/.test(attrs)) scripts.push({ attrs, body });
    return '<script></script>';
  });
  const titles = [...markup.matchAll(/<title>([\s\S]*?)<\/title>/gi)];
  if (titles.length !== 1) throw new Error(`The build should have one <title>, and has ${titles.length}.`);
  const styles = [...markup.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
  const own = styles.filter(([, attrs]) => /\bid="copper-style"/.test(attrs));
  if (own.length !== 1) throw new Error(`The build should have one <style id="copper-style"> (from index.html), and has ${own.length}.`);
  if (styles.length > 1) throw new Error('The build has a <style> besides copper-style, which the page would lose: move that CSS into copper-style.');
  if (/<link\b[^>]*\brel="?stylesheet/i.test(markup)) throw new Error('The build links a stylesheet, which the page would lose: inline it.');
  const modules = scripts.filter(({ attrs }) => /\btype="?module/i.test(attrs));
  if (modules.length !== 1) throw new Error(`The build should have one module script (the whole game), and has ${modules.length}.`);
  if (scripts.length > 1) throw new Error('The build has a script besides the game, which the page would lose.');
  const [game] = modules;
  if (/\bsrc=/i.test(game.attrs) || !game.body.trim()) throw new Error('The game script is not inlined: build with npm run build:single.');
  return { title: decodeEntities(titles[0][1].trim()), style: own[0][2], script: game.body };
}

/**
 * The page content the Artifact tool publishes: the single-file build's title, style and game, with
 * `tuningText` (the repo's tuning file) as its balance. Checked by reading it back.
 */
export function buildArtifactPage(singleHtml, tuningText) {
  const tuning = tuningText.trim(); // trim() also drops a byte-order mark
  let parsed;
  try {
    parsed = JSON.parse(tuning);
  } catch (e) {
    throw new Error(`The tuning file is not valid JSON (${e instanceof Error ? e.message : e}).`);
  }
  if (parsed?.format !== 'copper-tuning') throw new Error('The tuning file is not a Copper tuning file (its format should be "copper-tuning").');
  const parts = { ...extractBuildParts(singleHtml), tuning };
  const content = buildPageContent(parts);
  const back = parsePage(content);
  const same =
    back !== null &&
    back.title === parts.title &&
    back.style === parts.style &&
    back.script === parts.script &&
    JSON.stringify(JSON.parse(back.tuning)) === JSON.stringify(parsed);
  if (!same) throw new Error('The page does not read back as itself (see src/studio/page.ts).');
  return content;
}

/** "saved 2026-10-12 19:00 UTC", or '' for a save without a time. */
const savedOn = (iso) => (iso ? `saved ${iso.replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC')}` : '');

/**
 * Why pulling `file` over the repo's balance (`repo`) would lose saves, or null. Fine when `file` is
 * the repo's version or was saved on top of it: its history then holds the repo's last save. A file
 * whose history no longer reaches back that far (it keeps the last 30) is taken on trust.
 */
function wouldLose(file, repo) {
  if (repo.revision === 0) return null;
  if (file.revision < repo.revision) {
    return `The repo's balance (version ${repo.revision}) is newer than this page's (version ${file.revision}).`;
  }
  const mine = [file, ...file.history].find((save) => save.revision === repo.revision);
  if (!mine || (mine.savedAt || '') === (repo.savedAt || '')) return null;
  const repoSave = [`version ${repo.revision}`, savedOn(repo.savedAt)].filter(Boolean).join(', ');
  const pageSave = savedOn(mine.savedAt) ? ` (${savedOn(mine.savedAt)})` : '';
  return `The repo's balance (${repoSave}) and this page's were saved separately: the page's version ${repo.revision} is a different save${pageSave}, so pulling would lose the repo's.`;
}

/**
 * What `pull` writes into the repo from a page saved on claude.ai (or a tuning file exported from
 * the Studio): the tuning file with its map moved out (history kept) and the map, when there is one.
 * `tuning` is src/config/tuning.ts; `repoTuning` the repo's tuning file now. Throws for anything that
 * isn't a Copper page or tuning file, and for balance that would lose the repo's saves: older, or
 * saved separately (unless `force`).
 */
export function pullTuning(text, { parseTuning, stringifyTuning }, { repoTuning = '', force = false } = {}) {
  let json = text.trim();
  if (!json.startsWith('{')) {
    const parts = parsePage(text);
    if (!parts) throw new Error("That isn't a Project Copper page Copper Studio can save into (it has no copper-style, copper-tuning and copper-game parts).");
    json = parts.tuning;
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Its tuning file is not valid JSON (${e instanceof Error ? e.message : e}).`);
  }
  if (raw?.format !== 'copper-tuning') throw new Error('Its tuning file is not a Copper tuning file (its format should be "copper-tuning").');
  const { file, warnings } = parseTuning(json);
  // Not even with --force: it would record a version that was never saved anywhere.
  if (file.draftOf !== undefined) {
    throw new Error(
      `That is a draft exported from Copper Studio (unsaved changes on top of version ${file.draftOf}), not a saved version. Nothing was written. Import it in the Studio (⋯ › Import…) and Save to game, then pull that page.`,
    );
  }
  const loss = wouldLose(file, parseTuning(repoTuning).file);
  if (loss && !force) {
    throw new Error(`${loss} Nothing was written. Compare the two (git log src/config/tuning.json, and the page's history in Copper Studio), or add --force to replace the repo's balance with the page's.`);
  }
  return { file, warnings, tuningText: stringifyTuning({ ...file, map: null }), mapText: file.map === null ? null : repoText(file.map) };
}

// ---- command line -------------------------------------------------------------------------------

const at = (path) => resolve(ROOT, path);
const shown = (path) => relative(process.cwd(), path) || path;
const megabytes = (text) => `${(Buffer.byteLength(text) / 1024 / 1024).toFixed(2)} MB`;
const option = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : null;
};

async function build(args) {
  const input = option(args, '--in') ?? at(FILES.build);
  const out = option(args, '--out') ?? at(FILES.page);
  const html = await readFile(input, 'utf8').catch(() => {
    throw new Error(`There is no single-file build at ${shown(input)}: run npm run build:single first (npm run artifact does both).`);
  });
  const tuning = await readFile(at(FILES.tuning), 'utf8');
  const content = buildArtifactPage(html, tuning);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, content);
  console.log(`Wrote ${shown(out)} (${megabytes(content)}), with balance version ${JSON.parse(tuning.trim()).revision ?? 0} from ${FILES.tuning}.`);
  console.log(`Publish it with the Artifact tool, declaring capabilities ${JSON.stringify(PAGE_CAPABILITIES)}, so Copper Studio can save into it.`);
  console.log('If balance was saved in the Studio on claude.ai since the last publish, pull that page first (node tools/artifact-page.mjs pull <page>): publishing replaces it.');
}

/**
 * src/config/tuning.ts, loaded through Vite (it uses the bundler's import style, which Node can't
 * load). It and its imports are plain TypeScript, so no project config, plugins or dependency scan.
 */
async function loadTuning() {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await vite.ssrLoadModule('/src/config/tuning.ts');
  } finally {
    await vite.close();
  }
}

async function pull(args) {
  const source = args.find((a) => !a.startsWith('--'));
  if (!source) throw new Error('Pull from which page? node tools/artifact-page.mjs pull <saved-page.html>');
  const text = await readFile(source, 'utf8');
  const tuning = await loadTuning();
  const repoTuning = await readFile(at(FILES.tuning), 'utf8').catch(() => '');
  const pulled = pullTuning(text, tuning, { repoTuning, force: args.includes('--force') });
  const { file } = pulled;
  await writeFile(at(FILES.tuning), pulled.tuningText);
  if (pulled.mapText !== null) await writeFile(at(FILES.map), pulled.mapText);

  const saved = savedOn(file.savedAt) ? ` (${savedOn(file.savedAt)})` : '';
  console.log(`Pulled balance version ${file.revision}${saved}${file.note ? `: "${file.note}"` : ''}`);
  const latest = file.history[0]?.revision === file.revision ? file.history[0].changes : [];
  if (latest.length) {
    console.log('Latest changes:');
    for (const change of latest.slice(0, 30)) console.log(`  ${change}`);
    if (latest.length > 30) console.log(`  ...and ${latest.length - 30} more`);
  }
  for (const warning of pulled.warnings) console.log(`  ! ${warning}`);
  const written = [FILES.tuning, ...(pulled.mapText !== null ? [FILES.map] : [])];
  console.log(`Wrote ${written.join(' and ')}. Look over the change (git diff), commit it, then npm run artifact to rebuild the page.`);
}

const USAGE = `Usage:
  node tools/artifact-page.mjs build [--in dist-single/index.html] [--out .tmp-artifact/project-copper.html]
  node tools/artifact-page.mjs pull <saved-page.html | copper-tuning-vN.json> [--force]`;

async function main([command, ...args]) {
  if (command === 'build') return build(args);
  if (command === 'pull') return pull(args);
  console.log(USAGE);
  if (command) process.exitCode = 1;
}

const runDirectly = (() => {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (runDirectly) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
