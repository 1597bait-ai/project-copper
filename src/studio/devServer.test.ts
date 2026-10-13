import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copperTuning, tuningEndpoint, tuningTag, type EndpointRequest, type EndpointResponse } from '../../tools/vite-copper.mjs';
import * as tuning from '../config/tuning';
import { emptyTuning, makeSave, parseTuning, stringifyTuning, valuesWith, type TuningFile } from '../config/tuning';
import { paint } from '../world/editing';
import { parseMap, serializeMap } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';
import { validateMap } from '../world/validate';

// The dev server's save endpoint (tools/vite-copper.mjs), driven with fake requests against a temp
// folder standing in for the repo.

/** The bits of node:fs and node:os this test uses (the project has no Node typings). */
interface NodeFs {
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, text: string): void;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}
const fs = await vi.importActual<NodeFs>('node:fs');
const { tmpdir } = await vi.importActual<{ tmpdir(): string }>('node:os');

const REPO_TUNING = stringifyTuning(emptyTuning());
const REPO_MAP = '#####\n#P.V#\n#####\n';
/** A map the game can play: the built-in school with a copper pile painted on its first hallway tile. */
const PLAYABLE = (() => {
  const built = parseMap(DEFAULT_MAP.text);
  for (let y = 0; y < built.height; y++) {
    const x = built.rows[y].indexOf('.');
    const r = x >= 0 ? paint(built.rows, x, y, 'c') : null;
    if (r?.changed) return serializeMap(r.rows, built.names);
  }
  throw new Error('no hallway tile');
})();

let dir: string;
let files: { tuningFile: string; mapFile: string };
const read = () => ({ tuning: fs.readFileSync(files.tuningFile, 'utf8'), map: fs.readFileSync(files.mapFile, 'utf8') });

beforeEach(() => {
  dir = fs.mkdtempSync(`${tmpdir()}/copper-tuning-`);
  files = { tuningFile: `${dir}/tuning.json`, mapFile: `${dir}/lincoln.txt` };
  fs.writeFileSync(files.tuningFile, REPO_TUNING);
  fs.writeFileSync(files.mapFile, REPO_MAP);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const mapRules = async () => ({ parseMap, validateMap });
const endpoint = (maxBody?: number) => tuningEndpoint({ ...files, loadTuning: async () => tuning, loadMapRules: mapRules, maxBody });

interface Answer {
  status: number;
  body: { ok?: boolean; error?: string; files?: string[]; warnings?: string[]; tuning?: unknown; map?: unknown };
}

/**
 * One request through the endpoint, the way Node delivers it (the body in chunks, after the handler
 * subscribed). From this machine unless `from` says otherwise.
 */
function call(handler: ReturnType<typeof tuningEndpoint>, method: string, body = '', headers: Record<string, string> = {}, from = '127.0.0.1'): Promise<Answer> {
  return new Promise((resolve) => {
    const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
    const req: EndpointRequest = {
      method,
      headers: { host: 'localhost:5173', 'content-type': 'application/json', ...headers },
      socket: { remoteAddress: from },
      on(event, listener) {
        (listeners[event] ??= []).push(listener);
        return req;
      },
      resume: () => req,
    };
    const res: EndpointResponse = {
      statusCode: 200,
      setHeader: () => res,
      end: (text) => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} }),
    };
    handler(req, res);
    const bytes = new TextEncoder().encode(body);
    setTimeout(() => {
      for (let at = 0; at < bytes.length; at += 16_384) for (const listener of listeners.data ?? []) listener(bytes.subarray(at, at + 16_384));
      for (const listener of listeners.end ?? []) listener();
    });
  });
}

const post = (tuningFile: unknown, headers?: Record<string, string>, handler = endpoint(), from?: string) => call(handler, 'POST', JSON.stringify({ tuning: tuningFile }), headers, from);

function studioSave(map: string | null): TuningFile {
  const values = valuesWith({ balance: { boss: { sprintFactor: 2 } }, materials: { copper: { pricePerUnit: 12 } } });
  return makeSave({ values, map, note: 'faster boss, pricier copper', previous: emptyTuning(), now: '2026-10-12T10:00:00.000Z', builtInMap: REPO_MAP });
}

describe('the dev server save endpoint', () => {
  it('GET answers with the repo files (so the Studio knows it can save here)', async () => {
    const answer = await call(endpoint(), 'GET');
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ tuning: JSON.parse(REPO_TUNING), map: REPO_MAP });
  });

  it('saves the numbers into the tuning file and the map into its own file', async () => {
    const file = studioSave(PLAYABLE.trimEnd().replace(/\n/g, '\r\n'));
    const answer = await post(file);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(answer.body.files?.map((f) => f.split(/[\\/]/).pop())).toEqual(['lincoln.txt', 'tuning.json']);
    const saved = read();
    expect(saved.map).toBe(`${PLAYABLE.trimEnd()}\n`);
    expect(saved.tuning).toBe(stringifyTuning({ ...file, map: null }));
    // History keeps each save's map, so an older version can still be loaded back.
    expect(parseTuning(saved.tuning).file.history[0].map).toBe(file.map);
  });

  it('leaves the map file alone when the map is the built-in one', async () => {
    const file = studioSave(null);
    expect((await post(file)).status).toBe(200);
    expect(read()).toEqual({ tuning: stringifyTuning(file), map: REPO_MAP });
  });

  it('writes only what the game would play: unknown values dropped, numbers clamped', async () => {
    const file = { ...studioSave(null), values: { balance: { boss: { sprintFactor: 50 }, secretCheat: 1 } } };
    const answer = await post(file);
    expect(answer.status).toBe(200);
    expect(answer.body.warnings?.join('\n')).toMatch(/secretCheat/);
    expect(JSON.parse(read().tuning).values).toEqual({ balance: { boss: { sprintFactor: 3 } } });
  });

  it.each([
    ['not JSON', () => call(endpoint(), 'POST', '{"tuning": '), 400],
    ['no tuning file', () => call(endpoint(), 'POST', JSON.stringify({ hello: 1 })), 400],
    ['another format', () => post({ ...studioSave(null), format: 'something-else' }), 400],
    ['values missing', () => post({ ...studioSave(null), values: undefined }), 400],
    ['a map that is not text', () => post({ ...studioSave(null), map: 42 }), 400],
    ['a history that is not a list', () => post({ ...studioSave(null), history: 'yes' }), 400],
    ["a map the game can't play", () => post(studioSave('#####\n#P..#\n#####')), 400],
    ['a tool on another machine (no Origin: not a page)', () => post(studioSave(null), {}, endpoint(), '192.168.1.50'), 403],
    ['too big', () => post(studioSave('#'.repeat(5_000)), {}, endpoint(4_096)), 413],
    ['another site posting', () => post(studioSave('#####'), { origin: 'https://evil.example' }), 403],
    ['another dev server on this machine', () => post(studioSave('#####'), { origin: 'http://localhost:3000' }), 403],
    ['a sandboxed page', () => post(studioSave('#####'), { origin: 'null' }), 403],
    ['not sent as JSON', () => post(studioSave('#####'), { 'content-type': 'text/plain' }), 415],
    ['a PUT', () => call(endpoint(), 'PUT', JSON.stringify({ tuning: studioSave('#####') })), 405],
  ])('writes nothing for a bad request: %s', async (_name, send, status) => {
    const answer = await send();
    expect(answer.status).toBe(status);
    expect(answer.body.error).toEqual(expect.any(String));
    expect(read()).toEqual({ tuning: REPO_TUNING, map: REPO_MAP });
  });

  it('only takes a save made from the version the repo has now, like claude.ai', async () => {
    const first = studioSave(null); // version 1, made from version 0
    expect((await post(first)).status).toBe(200);
    const afterFirst = read();
    // Another tab still on version 0 saves its own version 1: it would undo the first save.
    const stale = makeSave({ values: valuesWith({ npcs: { mr_gravy: { speed: 1 } } }), map: PLAYABLE, note: 'from a stale tab', previous: emptyTuning(), now: '2026-10-12T10:05:00.000Z', builtInMap: REPO_MAP });
    const refused = await post(stale);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/version 1 now.*made from version 0/);
    expect(read()).toEqual(afterFirst);
    // Made from version 1 (after a reload), it goes through.
    const next = makeSave({ values: valuesWith({ npcs: { mr_gravy: { speed: 1 } } }), map: null, note: 'slower boss', previous: first, now: '2026-10-12T10:06:00.000Z', builtInMap: REPO_MAP });
    expect((await post(next)).status).toBe(200);
    expect(parseTuning(read().tuning).file).toMatchObject({ revision: 2, note: 'slower boss' });
  });

  it('reads the repo’s version through a byte-order mark (a file saved by Notepad)', async () => {
    const first = studioSave(null);
    fs.writeFileSync(files.tuningFile, `${String.fromCharCode(0xfeff)}${stringifyTuning(first)}`);
    const next = makeSave({ values: valuesWith({}), map: null, note: 'back to normal', previous: first, now: '2026-10-12T10:06:00.000Z', builtInMap: REPO_MAP });
    expect((await post(next)).status).toBe(200);
    expect(parseTuning(read().tuning).file.revision).toBe(2);
  });

  it('takes a save from the game page itself (also on a phone over Wi-Fi)', async () => {
    const answer = await post(studioSave(null), { host: '192.168.1.20:5173', origin: 'http://192.168.1.20:5173' }, endpoint(), '192.168.1.30');
    expect(answer.status).toBe(200);
  });

  it("takes a tool's save from this machine (no Origin), over IPv6 too", async () => {
    expect((await post(studioSave(null), {}, endpoint(), '::1')).status).toBe(200);
  });

  it('says what went wrong when the game code cannot load, and writes nothing', async () => {
    const broken = tuningEndpoint({ ...files, loadTuning: () => Promise.reject(new Error('tuning.ts: syntax error')), loadMapRules: mapRules });
    const answer = await post(studioSave('#####'), {}, broken);
    expect(answer).toMatchObject({ status: 500, body: { error: expect.stringMatching(/syntax error/) } });
    expect(read()).toEqual({ tuning: REPO_TUNING, map: REPO_MAP });
  });
});

describe('the tuning file in the page', () => {
  it('is embedded so that no note or line can break the page', () => {
    const file = { ...emptyTuning(), note: "costs $' and $& now </script><b>x</b>" };
    fs.writeFileSync(files.tuningFile, `${String.fromCharCode(0xfeff)}${stringifyTuning(file)}`); // with a byte-order mark
    const tag = tuningTag(files.tuningFile);
    expect(tag.match(/<\/script>/g)).toHaveLength(1);
    const html = (copperTuning(files).transformIndexHtml as { handler: (html: string) => string }).handler('<body><!-- copper-tuning --><div id="game"></div></body>');
    expect(html).toBe(`<body>${tag}<div id="game"></div></body>`);
    const json = /<script type="application\/json" id="copper-tuning">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(parseTuning(json).file.note).toBe(file.note);
  });

  it('stops the build when the tuning file is broken (a merge conflict, say)', () => {
    fs.writeFileSync(files.tuningFile, '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n');
    expect(() => tuningTag(files.tuningFile)).toThrow(/not valid JSON/);
  });
});
