import { describe, expect, it } from 'vitest';
import { buildArtifactPage, extractBuildParts, pullTuning } from '../../tools/artifact-page.mjs';
import * as tuning from '../config/tuning';
import { emptyTuning, makeSave, stringifyTuning, valuesWith } from '../config/tuning';
import { buildArtifactDocument, parsePage, wrapInHost } from './page';

// tools/artifact-page.mjs: the page published on claude.ai, built from the single-file build, and
// balance saved there pulled back into the repo.

// The game's strings may hold markup of their own (an SVG icon with a <title>, a comment...).
const SCRIPT =
  'const a=1<2&&3>2;const icon=`<svg><title>Save</title><style>.a{}</style></svg>`;' +
  'const font=`<link rel="stylesheet" href="x.css">`;window.__COPPER__={a,icon,font,s:"<!-- x -->"};';
const STYLE = ':root{--bg:#14161c}html,body{margin:0}';

/** Like dist-single/index.html. */
function singleBuild({ head = '', body = '' } = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Project Copper &amp; Co</title>
    <!-- The pixel fonts are part of the game: nothing to fetch. <script>old()</script> <title>x</title> -->
    <style id="copper-style">${STYLE}</style>
    <script type="module" crossorigin>${SCRIPT}</script>${head}
  </head>
  <body>
    <script type="application/json" id="copper-tuning">{"format":"copper-tuning"}</script>
    <div id="game"></div>${body}
  </body>
</html>
`;
}

const REPO_TUNING = stringifyTuning(emptyTuning());
const BUILT_IN_MAP = '#####\n#P.V#\n#####\n';

function claudeSave(map: string | null) {
  const values = valuesWith({ npcs: { mr_gravy: { speed: 2.5 } } });
  return makeSave({ values, map, note: 'testers: Gravy too slow', previous: emptyTuning(), now: '2026-10-12T10:00:00.000Z', builtInMap: BUILT_IN_MAP });
}

describe('building the page', () => {
  it('takes the title, the style and the game from the single-file build', () => {
    expect(extractBuildParts(singleBuild())).toEqual({ title: 'Project Copper & Co', style: STYLE, script: SCRIPT });
  });

  it.each([
    ['no copper-style', singleBuild().replace(' id="copper-style"', '')],
    ['a second style', singleBuild({ head: '<style>.x{}</style>' })],
    ['a linked stylesheet', singleBuild({ head: '<link rel="stylesheet" href="x.css">' })],
    ['the game not inlined', singleBuild().replace(`<script type="module" crossorigin>${SCRIPT}`, '<script type="module" crossorigin src="./assets/index.js">')],
    ['two module scripts', singleBuild({ body: '<script type="module">more()</script>' })],
    ['a script besides the game', singleBuild({ body: '<script>analytics()</script>' })],
    ['no title', singleBuild().replace(/<title>.*<\/title>/, '')],
  ])('fails loudly on a build with %s', (_name, html) => {
    expect(() => extractBuildParts(html)).toThrow();
  });

  it('makes the content the Artifact tool publishes, with the repo tuning file inside', () => {
    const content = buildArtifactPage(singleBuild(), REPO_TUNING);
    const parts = parsePage(content);
    expect(parts).toMatchObject({ title: 'Project Copper & Co', style: STYLE, script: SCRIPT });
    expect(JSON.parse(parts!.tuning)).toEqual(emptyTuning());
    // What a viewer gets once claude.ai wraps it is exactly what the page rebuilds when it saves.
    expect(wrapInHost(content)).toBe(buildArtifactDocument(parts!));
  });

  it('refuses a broken tuning file', () => {
    expect(() => buildArtifactPage(singleBuild(), '{ "format": "copper-tuning", ')).toThrow(/not valid JSON/);
    expect(() => buildArtifactPage(singleBuild(), '{ "hello": 1 }')).toThrow(/not a Copper tuning file/);
  });
});

describe('pulling balance saved on claude.ai', () => {
  const page = (file: unknown) => buildArtifactDocument({ title: 'Project Copper', style: STYLE, script: SCRIPT, tuning: JSON.stringify(file, null, 2) });

  it('moves the map into its own file and keeps the values and history in the tuning file', () => {
    const file = claudeSave('#####\r\n#P..V#\r\n#####');
    const pulled = pullTuning(page(file), tuning);
    expect(pulled.file).toEqual(file);
    expect(pulled.tuningText).toBe(stringifyTuning({ ...file, map: null }));
    expect(pulled.mapText).toBe('#####\n#P..V#\n#####\n');
    expect(pulled.warnings).toEqual([]);
  });

  it('leaves the map alone when the page plays the built-in one', () => {
    const pulled = pullTuning(page(claudeSave(null)), tuning);
    expect(pulled.mapText).toBeNull();
    expect(pulled.file.history[0].changes).toEqual(['Mr. Gravy › Stats › Speed: 2 → 2.5']);
  });

  it('takes a tuning file exported from the Studio too', () => {
    const file = claudeSave(null);
    expect(pullTuning(stringifyTuning(file), tuning).tuningText).toBe(stringifyTuning(file));
  });

  it('will not go back to older balance than the repo has, unless forced', () => {
    const older = page(claudeSave(null)); // version 1
    const repoTuning = stringifyTuning({ ...emptyTuning(), revision: 3 });
    expect(() => pullTuning(older, tuning, { repoTuning })).toThrow(/newer than this page's/);
    expect(pullTuning(older, tuning, { repoTuning, force: true }).file.revision).toBe(1);
    expect(pullTuning(older, tuning, { repoTuning: stringifyTuning({ ...emptyTuning(), revision: 1 }) }).file.revision).toBe(1);
  });

  it('refuses anything else', () => {
    expect(() => pullTuning('<!doctype html><title>Project Copper</title><p>an old page</p>', tuning)).toThrow(/isn't a Project Copper page/);
    expect(() => pullTuning(page(claudeSave(null)).replace('"format": "copper-tuning"', '"format": "copper-tuning'), tuning)).toThrow(/not valid JSON/);
    expect(() => pullTuning('{ "format": "something-else" }', tuning)).toThrow(/not a Copper tuning file/);
  });
});
