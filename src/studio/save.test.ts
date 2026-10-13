import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTuning, makeSave, parseTuning, stringifyTuning, valuesWith, type TuningFile } from '../config/tuning';
import { buildArtifactDocument, parsePage, type PageParts } from './page';

// save.ts runs against a fake claude.ai runtime (window.claude), a fake fetch and a fake document
// holding just what a browser's DOM would for the page. Each test loads a fresh copy of the module,
// because detectSaveEnv() remembers its answer for the life of the page.

type SaveModule = typeof import('./save');
let save: SaveModule;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('DEV', false);
  save = await import('./save');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The page as Claude publishes it, and what a browser's DOM holds once it has loaded it. */
const PARTS: PageParts = {
  title: 'Project Copper & Co',
  style: 'html,body{margin:0;background:#14161c}',
  tuning: stringifyTuning(emptyTuning()),
  script: 'window.__COPPER__ = { ok: 1 < 2 && 3 > 2, s: `<\\/script>` };',
};
const LIVE = parsePage(buildArtifactDocument(PARTS))!;

const BUILT_IN_MAP = '#####\n#P.V#\n#####\n';

/** A tuning file as the Studio saves it, with text that tries to break out of the page. */
function savedFile(previous: TuningFile = emptyTuning()): TuningFile {
  const values = valuesWith({ balance: { boss: { sprintFactor: 2 } }, npcs: { mr_gravy: { speed: 3 } } });
  return makeSave({
    values,
    map: '#####\n#P.V#\n#.<\u2028#\n#####',
    note: "faster boss </script><script>alert(1)</script> $' $& $$",
    previous,
    now: '2026-10-12T10:00:00.000Z',
    builtInMap: BUILT_IN_MAP,
  });
}

interface FakeLink {
  tag: string;
  href: string;
  download: string;
  hidden: boolean;
  clicks: number;
  removed: boolean;
  click(): void;
  remove(): void;
}

/** The bits of the DOM save.ts reads. A part left out is a page without that element. */
function installDocument(parts: Partial<PageParts>, options: { hostTitle?: string } = {}) {
  const head = { tagName: 'HEAD' };
  const links: FakeLink[] = [];
  const body = { tagName: 'BODY', append: (link: FakeLink) => links.push(link) };
  const element = (tagName: string, textContent: string, parentNode: object = body) => ({ tagName, textContent, parentNode });
  const byId: Record<string, ReturnType<typeof element>> = {};
  if (parts.style !== undefined) byId['copper-style'] = element('STYLE', parts.style);
  if (parts.tuning !== undefined) byId['copper-tuning'] = element('SCRIPT', parts.tuning);
  if (parts.script !== undefined) byId['copper-game'] = element('SCRIPT', parts.script);
  const titles = [
    ...(options.hostTitle !== undefined ? [element('TITLE', options.hostTitle, head)] : []),
    ...(parts.title !== undefined ? [element('TITLE', parts.title)] : []),
  ];
  vi.stubGlobal('document', {
    body,
    getElementById: (id: string) => byId[id] ?? null,
    getElementsByTagName: (tag: string) => (tag === 'title' ? titles : []),
    createElement: (tag: string): FakeLink => {
      const link: FakeLink = {
        tag,
        href: '',
        download: '',
        hidden: false,
        clicks: 0,
        removed: false,
        click: () => link.clicks++,
        remove: () => (link.removed = true),
      };
      return link;
    },
  });
  return { links };
}

interface FakeClaude {
  /** No `artifact` capability in this view (the page opened on its own, or not declared). */
  noArtifact?: boolean;
  noDownloads?: boolean;
  canEdit?: boolean;
  publish?: (html: string) => Promise<{ version: string }>;
  save?: (request: { filename: string; data: string | Blob }) => Promise<{ status: 'saved' | 'delivered' }>;
  /** A host that never answers. */
  silent?: boolean;
  /** Inside claude.ai's viewer (a frame), not opened on its own. */
  framed?: boolean;
}

/** A claude.ai runtime as the page sees it (window.claude.use). */
function installClaude(options: FakeClaude = {}) {
  const published: string[] = [];
  const publish = vi.fn(
    options.publish ??
      (async (html: string) => {
        published.push(html);
        return { version: `v${published.length}` };
      }),
  );
  const saveFile = vi.fn(options.save ?? (async () => ({ status: 'saved' as const })));
  const capabilities: Record<string, object | null> = {
    artifact: options.noArtifact ? null : Object.freeze({ publish }),
    user: Object.freeze({ canEdit: async () => options.canEdit ?? true }),
    downloads: options.noDownloads ? null : Object.freeze({ save: saveFile }),
  };
  const use = vi.fn((name: string) => (options.silent ? new Promise<null>(() => {}) : Promise.resolve(capabilities[name] ?? null)));
  const win: Record<string, unknown> = { claude: { use } };
  win.self = win;
  win.top = options.framed ? {} : win;
  vi.stubGlobal('window', win);
  return { use, publish, published, saveFile };
}

/** A promise's outcome, caught at once (so fake timers can run while it is pending). */
function outcome<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error: error as { code?: string; message?: string; name?: string } }),
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('where a save goes', () => {
  it('claude.ai, opened by its owner: republishing the page', async () => {
    const claude = installClaude();
    installDocument(LIVE);
    await expect(save.detectSaveEnv()).resolves.toEqual({ target: 'artifact', canSave: true });
    expect(claude.use).toHaveBeenCalledWith('artifact');
    expect(claude.use).toHaveBeenCalledWith('user');
  });

  it('claude.ai, opened by a tester: read-only', async () => {
    installClaude({ canEdit: false });
    installDocument(LIVE);
    const env = await save.detectSaveEnv();
    expect(env).toMatchObject({ target: 'artifact', canSave: false });
    expect(env.reason).toMatch(/owner/);
  });

  it('claude.ai, a page published before the Studio could save: asks for a republish', async () => {
    installClaude();
    installDocument({ title: 'Project Copper', style: PARTS.style, tuning: PARTS.tuning }); // no #copper-game
    const env = await save.detectSaveEnv();
    expect(env).toMatchObject({ target: 'artifact', canSave: false });
    expect(env.reason).toBe('This copy of the game was published before Copper Studio could save into it — ask Claude to republish it.');
  });

  it('a tester on such an old page hears that only the owner can save', async () => {
    installClaude({ canEdit: false });
    installDocument({});
    expect((await save.detectSaveEnv()).reason).toMatch(/owner/);
  });

  it('claude.ai without the artifact capability (the page opened on its own): export instead', async () => {
    installClaude({ noArtifact: true });
    installDocument(LIVE);
    const env = await save.detectSaveEnv();
    expect(env).toMatchObject({ target: 'none', canSave: false });
    expect(env.reason).toMatch(/claude\.ai.*export/s);
  });

  it('never waits much more than 10 s for a host that never answers', async () => {
    vi.useFakeTimers();
    installClaude({ silent: true });
    installDocument(LIVE);
    const result = outcome(save.detectSaveEnv());
    await vi.advanceTimersByTimeAsync(10_000);
    const { value } = await result;
    expect(value).toMatchObject({ target: 'none', canSave: false });
  });

  it('never throws, even when the runtime does', async () => {
    vi.stubGlobal('window', {
      claude: {
        use: () => {
          throw new Error('boom');
        },
      },
    });
    installDocument(LIVE);
    await expect(save.detectSaveEnv()).resolves.toMatchObject({ target: 'none', canSave: false });
  });

  it('is worked out once per page load', async () => {
    const claude = installClaude();
    installDocument(LIVE);
    const first = save.detectSaveEnv();
    expect(save.detectSaveEnv()).toBe(first);
    await first;
    await save.detectSaveEnv();
    expect(claude.use).toHaveBeenCalledTimes(2); // artifact + user, once
  });

  it('the dev server: when its save endpoint answers', async () => {
    vi.stubEnv('DEV', true);
    const fetch = vi.fn(async () => json({ tuning: emptyTuning(), map: BUILT_IN_MAP }));
    vi.stubGlobal('fetch', fetch);
    await expect(save.detectSaveEnv()).resolves.toEqual({ target: 'dev', canSave: true });
    expect(fetch).toHaveBeenCalledWith('/__copper/tuning', expect.objectContaining({ cache: 'no-store' }));
  });

  it('the dev server without its endpoint (or another server answering with a page): export instead', async () => {
    vi.stubEnv('DEV', true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<!doctype html><p>index</p>', { status: 200 })),
    );
    const env = await save.detectSaveEnv();
    expect(env).toMatchObject({ target: 'none', canSave: false });
    expect(env.reason).toMatch(/npm run dev/);

    vi.resetModules();
    save = await import('./save');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(save.detectSaveEnv()).resolves.toMatchObject({ target: 'none', canSave: false });
  });

  it('a static copy (GitHub Pages, a downloaded file): export instead, without asking any server', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    installDocument(LIVE);
    const env = await save.detectSaveEnv();
    expect(env).toMatchObject({ target: 'none', canSave: false });
    expect(env.reason).toMatch(/static copy.*[Ee]xport/s);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('saving on claude.ai', () => {
  const env = { target: 'artifact', canSave: true } as const;

  it('republishes the page it is running, with the new tuning file inside', async () => {
    const claude = installClaude();
    installDocument(LIVE, { hostTitle: 'Claude' });
    const file = savedFile();
    await expect(save.saveTuning(file, env)).resolves.toEqual({ reloads: true });
    expect(claude.published).toHaveLength(1);
    const html = claude.published[0];
    expect(html).toBe(buildArtifactDocument({ ...LIVE, tuning: stringifyTuning(file) }));
    expect(html.startsWith('<!doctype html>')).toBe(true);
    // The note's "</script>" can't end the tuning early: only the tuning's and the game's tags close.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    // What every tester loads next: the same game and title, and this tuning file.
    const back = parsePage(html)!;
    expect(back).toMatchObject({ title: PARTS.title, style: PARTS.style, script: PARTS.script });
    expect(parseTuning(back.tuning)).toEqual({ file, warnings: [] });
  });

  it('the republished page can save again, and stays the same game', async () => {
    const claude = installClaude();
    installDocument(LIVE);
    const first = savedFile();
    await save.saveTuning(first, env);
    installDocument(parsePage(claude.published[0])!);
    const second = makeSave({ values: valuesWith({}), map: null, note: 'back to normal', previous: first, now: '2026-10-12T11:00:00.000Z', builtInMap: BUILT_IN_MAP });
    await save.saveTuning(second, env);
    const back = parsePage(claude.published[1])!;
    expect(back.script).toBe(PARTS.script);
    const { file } = parseTuning(back.tuning);
    expect(file).toEqual(second);
    expect(file.revision).toBe(2);
    expect(file.history.map((h) => h.note)).toEqual(['back to normal', first.note]);
  });

  it('refuses a page that is not in the publishable format, without publishing', async () => {
    const claude = installClaude();
    installDocument({ title: 'Project Copper', style: PARTS.style });
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ name: 'SaveError', code: 'unsupported_page' });
    expect(claude.publish).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 'conflict'],
    ['not_writer', 'not_writer'],
    ['not_granted', 'not_writer'],
    ['consent_required', 'not_writer'],
    ['not_declared', 'unsupported_page'],
    ['capability_disabled', 'unavailable'],
    ['capability_removed', 'unavailable'],
    ['too_large', 'too_large'],
    ['rate_limited', 'rate_limited'],
    ['invalid_content', 'failed'],
    ['transform_error', 'failed'],
  ])('a %s rejection becomes SaveError %s, without a retry', async (code, expected) => {
    const claude = installClaude({ publish: () => Promise.reject({ code, message: `host says ${code}` }) });
    installDocument(LIVE);
    const { error } = await outcome(save.saveTuning(savedFile(), env));
    expect(error).toBeInstanceOf(save.SaveError);
    expect(error).toMatchObject({ code: expected });
    expect(error?.message).not.toBe('');
    expect(claude.publish).toHaveBeenCalledTimes(1);
  });

  it('says how big the page is when it is too large', async () => {
    installClaude({ publish: () => Promise.reject({ code: 'too_large', message: 'too big' }) });
    installDocument(LIVE);
    const { error } = await outcome(save.saveTuning(savedFile(), env));
    expect(error?.message).toMatch(/\d+\.\d MB/);
  });

  it('retries a passing failure once, after a short random pause', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockRejectedValueOnce({ code: 'upstream_error', message: 'blip' }).mockResolvedValueOnce({ version: 'v2' });
    installClaude({ publish });
    installDocument(LIVE);
    const result = outcome(save.saveTuning(savedFile(), env));
    await vi.advanceTimersByTimeAsync(400);
    expect(publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await result).toEqual({ value: { reloads: true }, error: undefined });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry, treating unknown codes and odd rejections like passing failures', async () => {
    vi.useFakeTimers();
    const publish = vi.fn().mockRejectedValueOnce({ code: 'brand_new_code', message: 'eh' }).mockRejectedValueOnce(new Error('network down'));
    installClaude({ publish });
    installDocument(LIVE);
    const result = outcome(save.saveTuning(savedFile(), env));
    await vi.advanceTimersByTimeAsync(1_500);
    const { error } = await result;
    expect(error).toMatchObject({ code: 'failed' });
    expect(error?.message).toMatch(/network down/);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('stops waiting for a publish that never answers (and does not publish twice)', async () => {
    vi.useFakeTimers();
    const publish = vi.fn(() => new Promise<{ version: string }>(() => {}));
    installClaude({ publish });
    installDocument(LIVE);
    const result = outcome(save.saveTuning(savedFile(), env));
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await result).error).toMatchObject({ code: 'failed' });
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe('saving on the dev server', () => {
  const env = { target: 'dev', canSave: true } as const;

  it('posts the tuning file to the endpoint, which writes the repo files', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, files: ['src/config/tuning.json'], warnings: [] }));
    vi.stubGlobal('fetch', fetch);
    const file = savedFile();
    await expect(save.saveTuning(file, env)).resolves.toEqual({ reloads: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/__copper/tuning');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init?.body))).toEqual({ tuning: JSON.parse(JSON.stringify(file)) });
  });

  it('passes on what the game had to change about the file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: true, files: [], warnings: ['Speed: 99 is outside 0.5–8'] })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await save.saveTuning(savedFile(), env);
    expect(warn).toHaveBeenCalledWith('[tuning] Speed: 99 is outside 0.5–8');
  });

  it('turns refusals into SaveErrors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'Not a Copper tuning file.' }, 400)),
    );
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ code: 'failed', message: expect.stringMatching(/Not a Copper tuning file/) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'Too big.' }, 413)),
    );
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ code: 'too_large' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'The project’s balance is at version 3 now, and this save was made from version 0.' }, 409)),
    );
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/version 3 now.*reload the page/s) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ code: 'unavailable', message: expect.stringMatching(/npm run dev/) });
  });
});

describe('saving anywhere else', () => {
  it('is unavailable, with the reason detectSaveEnv gave', async () => {
    const env = await save.detectSaveEnv();
    await expect(save.saveTuning(savedFile(), env)).rejects.toMatchObject({ code: 'unavailable', message: env.reason });
  });
});

describe('exporting the tuning file', () => {
  const file = savedFile();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:copper');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  const installClipboard = (works = true) => {
    const writeText = vi.fn(async () => {
      if (!works) throw new DOMException('Not allowed', 'NotAllowedError');
    });
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    return writeText;
  };

  it('claude.ai offers the file to the viewer', async () => {
    const claude = installClaude();
    installDocument(LIVE);
    const writeText = installClipboard();
    await expect(save.exportTuning(file)).resolves.toBe('downloaded');
    expect(claude.saveFile).toHaveBeenCalledWith({ filename: 'copper-tuning-v1.json', data: stringifyTuning(file) });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies it instead when the viewer declines the download', async () => {
    installClaude({ save: () => Promise.reject({ code: 'declined', message: 'no thanks' }) });
    const { links } = installDocument(LIVE);
    const writeText = installClipboard();
    await expect(save.exportTuning(file)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(stringifyTuning(file));
    expect(links).toEqual([]); // no download behind the viewer's back
  });

  it('shows it when neither works', async () => {
    installClaude({ save: () => Promise.reject({ code: 'declined', message: 'no thanks' }) });
    installDocument(LIVE);
    installClipboard(false);
    await expect(save.exportTuning(file)).resolves.toBe('shown');
  });

  it('claude.ai without downloads: a download link when opened on its own, the clipboard inside a frame', async () => {
    installClaude({ noDownloads: true });
    const { links } = installDocument(LIVE);
    installClipboard();
    await expect(save.exportTuning(file)).resolves.toBe('downloaded');
    expect(links).toHaveLength(1);

    installClaude({ noDownloads: true, framed: true });
    const framed = installDocument(LIVE);
    await expect(save.exportTuning(file)).resolves.toBe('copied');
    expect(framed.links).toEqual([]);
  });

  it('a plain browser downloads it through a link', async () => {
    const { links } = installDocument(LIVE);
    const writeText = installClipboard();
    await expect(save.exportTuning(file)).resolves.toBe('downloaded');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ tag: 'a', href: 'blob:copper', download: 'copper-tuning-v1.json', clicks: 1, removed: true });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:copper');
  });

  it('copies it where there is no page to download from, and shows it as a last resort', async () => {
    installClipboard();
    await expect(save.exportTuning(file)).resolves.toBe('copied');
    vi.stubGlobal('navigator', {});
    await expect(save.exportTuning(file)).resolves.toBe('shown');
  });
});
