// Where Copper Studio's "Save to game" goes, and how.
//
// - On claude.ai (the game published as an Artifact): the page republishes itself with the new
//   tuning file inside it (see page.ts). Everyone who opens the link gets the new balance, and
//   every open copy reloads to it. Needs the artifact's `artifact` capability and a viewer who
//   may publish (the owner, or an editor).
// - On the dev server (npm run dev): writes src/config/tuning.json (and the map file) in the repo,
//   through the endpoint in tools/vite-copper.mjs.
// - Anywhere else (GitHub Pages, a downloaded copy): saving isn't possible; export the tuning file.

import { stringifyTuning, type TuningFile } from '../config/tuning';
import type { ArtifactCapability, ClaudeCapabilities, ClaudeRuntime } from './claude';
import { buildArtifactDocument, readLivePage } from './page';

export type SaveTarget = 'artifact' | 'dev' | 'none';

export interface SaveEnv {
  target: SaveTarget;
  /** Whether this viewer may save here (artifact: may publish a new version; dev: endpoint answers). */
  canSave: boolean;
  /** Why saving isn't possible, in plain English (when canSave is false). */
  reason?: string;
}

export type SaveErrorCode = 'conflict' | 'not_writer' | 'too_large' | 'rate_limited' | 'unsupported_page' | 'unavailable' | 'failed';

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
    /** No answer came, so the save may still have gone through (and the page may still reload to it). */
    readonly uncertain = false,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** The dev server's save endpoint (tools/vite-copper.mjs). */
const DEV_ENDPOINT = '/__copper/tuning';
/** detectSaveEnv() answers within this (claude.ai itself gives up on a silent host after 10 s). */
const DETECT_MS = 10_000;
/** A dev server answers at once; this only stops a dead one from stalling the check. */
const DEV_CHECK_MS = 4_000;
/** Longest wait for claude.ai to publish the page (~2 MB). */
const PUBLISH_MS = 60_000;
/** Longest wait for the dev server to write the files. */
const DEV_SAVE_MS = 20_000;
/** A passing claude.ai failure is retried once, after a random pause in this range (ms). */
const RETRY_PAUSE_MS = [500, 1500] as const;
/** Longest wait for claude.ai's downloads capability before copying the file instead. */
const EXPORT_WAIT_MS = 5_000;
const CLIPBOARD_MS = 5_000;

const megabytes = (text: string) => `${(new Blob([text]).size / 1024 / 1024).toFixed(1)} MB`;
/** ": what the host said", for the end of a sentence. */
const detail = (message: string) => (message.trim() ? `: ${message.trim().replace(/[.!]+$/, '')}` : '');

/** What people read when saving is off (SaveEnv.reason) or fails (SaveError.message). */
const MSG = {
  oldPage: 'This copy of the game was published before Copper Studio could save into it — ask Claude to republish it.',
  pageBroken: (message: string) => `This page can't be rebuilt with the new tuning${detail(message)}. Nothing was saved; ask Claude to republish the game.`,
  readOnly: "Only the game's owner (or an editor) can save changes into the game. Export the tuning file instead and send it to them.",
  noArtifact:
    "This view of the game can't save into it. Open the game on claude.ai as its owner; if saving is still off there, ask Claude to republish it with saving switched on. Meanwhile, export the tuning file.",
  staticCopy: "This is a static copy of the game (not its claude.ai page or the dev server), so saving can't change it. Export the tuning file instead.",
  devDown: "The dev server's save endpoint didn't answer, so saving into the repo is off. Restart npm run dev, or export the tuning file instead.",
  silentHost: "claude.ai didn't answer in time, so saving is off. Reload the page to try again, or export the tuning file instead.",
  conflict: 'A newer version of the game was published first (from another tab, or by Claude). The page is reloading to it: check your changes there and save again.',
  notWriter: "This view of the game is read-only: only its owner (or an editor) can save. Export the tuning file instead and send it to them.",
  notDeclared: 'This game page was published without saving switched on — ask Claude to republish it, then save again. Nothing was saved.',
  disabled: "claude.ai has switched saving off for this view of the game. Nothing was saved; export the tuning file instead.",
  tooLarge: (html: string) => `The game page is too big for claude.ai to publish (${megabytes(html)}). Nothing was saved; export the tuning file instead.`,
  rateLimited: 'claude.ai is getting too many saves from this game. Nothing was saved: wait a minute, then save again (one save can hold many changes).',
  refused: (message: string) => `claude.ai refused the new version of the page${detail(message)}. Nothing was saved.`,
  failed: (message: string) => `claude.ai couldn't publish the new version${detail(message)}. Unless the page reloads by itself, nothing was saved: try again in a minute.`,
  publishTimeout: "claude.ai didn't confirm the save in time. If the page reloads by itself, it worked; if not, save again.",
  devGone: "The dev server didn't answer (is npm run dev still running?). Nothing was saved.",
  devConflict: (message: string) => `${message} Nothing was saved: reload the page to work on the latest version.`,
  devRefused: (message: string) => `The dev server didn't save the tuning file: ${message}`,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `promise`'s value, or `fallback` when it rejects or takes longer than `ms`. Never rejects. */
function settle<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** `promise`, or a rejection with `error()` when it takes longer than `ms`. */
function deadline<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(error()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const field = (e: unknown, key: 'code' | 'message'): string => {
  const value = typeof e === 'object' && e !== null ? (e as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : '';
};

// ---- claude.ai ----------------------------------------------------------------------------

/** The claude.ai runtime, when the page runs on claude.ai. */
function claudeRuntime(): ClaudeRuntime | null {
  const claude = typeof window === 'undefined' ? undefined : window.claude;
  return typeof claude?.use === 'function' ? claude : null;
}

/** A claude.ai capability, or null where this view can't run it (or the host stays silent for `ms`). */
async function capability<K extends keyof ClaudeCapabilities>(name: K, ms: number): Promise<ClaudeCapabilities[K] | null> {
  const claude = claudeRuntime();
  if (!claude) return null;
  return (await settle(Promise.resolve().then(() => claude.use(name)), ms, null)) ?? null;
}

function isTopLevel(): boolean {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
}

// ---- where a save goes ----------------------------------------------------------------------

let detected: Promise<SaveEnv> | null = null;

/** Works out where a save would go, once per page load (memoized). Resolves within ~10 s; never rejects. */
export function detectSaveEnv(): Promise<SaveEnv> {
  detected ??= settle(
    findSaveEnv().catch((): SaveEnv => ({ target: 'none', canSave: false, reason: MSG.staticCopy })),
    DETECT_MS + 250,
    { target: 'none', canSave: false, reason: MSG.silentHost },
  );
  return detected;
}

async function findSaveEnv(): Promise<SaveEnv> {
  const started = Date.now();
  const left = () => DETECT_MS - (Date.now() - started);
  const claude = claudeRuntime();
  if (claude) {
    const [artifact, user] = await Promise.all([capability('artifact', left()), capability('user', left())]);
    if (artifact) {
      const canEdit = user ? (await settle(Promise.resolve().then(() => user.canEdit()), left(), false)) === true : false;
      // A tester can't save whatever the page looks like, so they hear about that first.
      if (!canEdit) return { target: 'artifact', canSave: false, reason: MSG.readOnly };
      if (!livePage()) return { target: 'artifact', canSave: false, reason: MSG.oldPage };
      return { target: 'artifact', canSave: true };
    }
  }
  if (import.meta.env.DEV) {
    if (await devServerAnswers(Math.min(left(), DEV_CHECK_MS))) return { target: 'dev', canSave: true };
    return { target: 'none', canSave: false, reason: MSG.devDown };
  }
  return { target: 'none', canSave: false, reason: claude ? MSG.noArtifact : MSG.staticCopy };
}

const livePage = () => (typeof document === 'undefined' ? null : readLivePage(document));

async function devServerAnswers(ms: number): Promise<boolean> {
  if (ms <= 0 || typeof fetch !== 'function') return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const res = await fetch(DEV_ENDPOINT, { cache: 'no-store', signal: abort.signal });
    // Another server could answer this path with its index page: only the endpoint's JSON counts.
    const body: unknown = res.ok ? await res.json() : null;
    return typeof body === 'object' && body !== null && 'tuning' in body;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---- saving -----------------------------------------------------------------------------------

/**
 * Saves a tuning file (its `map` included). Artifact: republishes the page and resolves
 * `{ reloads: true }` (claude.ai reloads this view to the new version shortly after: stash anything
 * that must survive in sessionStorage BEFORE calling). Dev: writes the repo files and resolves
 * `{ reloads: true }` too, but the CALLER reloads the page (the dev server only does for a map change).
 * Rejects with {@link SaveError}; `conflict` means a newer version was saved first (claude.ai is then
 * already reloading this view; on the dev server the caller reloads). `env.canSave` is advice for
 * the UI: claude.ai or the dev server has the last word.
 */
export async function saveTuning(file: TuningFile, env: SaveEnv): Promise<{ reloads: boolean }> {
  if (env.target === 'artifact') return publishPage(file);
  if (env.target === 'dev') return writeRepo(file);
  throw new SaveError('unavailable', env.reason ?? MSG.staticCopy);
}

/** Republishes this page with `file` inside: the same title, style and game, read from the DOM. */
async function publishPage(file: TuningFile): Promise<{ reloads: boolean }> {
  const page = livePage();
  if (!page) throw new SaveError('unsupported_page', MSG.oldPage);
  let html: string;
  try {
    html = buildArtifactDocument({ ...page, tuning: stringifyTuning(file) });
  } catch (e) {
    throw new SaveError('unsupported_page', MSG.pageBroken(field(e, 'message')));
  }
  const artifact = await capability('artifact', DETECT_MS);
  if (!artifact) throw new SaveError('unavailable', MSG.noArtifact);
  await publish(artifact, html);
  return { reloads: true };
}

async function publish(artifact: ArtifactCapability, html: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      // Not retried when it times out: the publish may still land (and reload the page).
      await deadline(Promise.resolve().then(() => artifact.publish(html)), PUBLISH_MS, () => new SaveError('failed', MSG.publishTimeout, true));
      return;
    } catch (e) {
      if (e instanceof SaveError) throw e;
      const error = publishError(field(e, 'code'), field(e, 'message'), html);
      if (error) throw error;
      // A passing failure can come after the page was published (only the answer got lost).
      if (attempt > 0) throw new SaveError('failed', MSG.failed(field(e, 'message')), true);
      await sleep(RETRY_PAUSE_MS[0] + Math.random() * (RETRY_PAUSE_MS[1] - RETRY_PAUSE_MS[0]));
    }
  }
}

/** The SaveError for a publish rejection, or null for a passing failure worth one retry (upstream_error, unknown codes). */
function publishError(code: string, message: string, html: string): SaveError | null {
  switch (code) {
    case 'conflict':
      return new SaveError('conflict', MSG.conflict);
    case 'not_writer':
    case 'not_granted':
    case 'consent_required':
      return new SaveError('not_writer', MSG.notWriter);
    case 'not_declared':
      return new SaveError('unsupported_page', MSG.notDeclared);
    case 'capability_disabled':
    case 'capability_removed':
      return new SaveError('unavailable', MSG.disabled);
    case 'too_large':
      return new SaveError('too_large', MSG.tooLarge(html));
    case 'rate_limited':
      return new SaveError('rate_limited', MSG.rateLimited);
    case 'invalid_content':
    case 'transform_error':
    case 'read_only_path':
      return new SaveError('failed', MSG.refused(message));
    default:
      return null;
  }
}

/** Dev server: POSTs the file to the endpoint, which writes src/config/tuning.json and the map file. */
async function writeRepo(file: TuningFile): Promise<{ reloads: boolean }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), DEV_SAVE_MS);
  let res: Response;
  let body: { error?: unknown; warnings?: unknown } | null;
  try {
    res = await fetch(DEV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tuning: file }),
      signal: abort.signal,
    });
    body = (await res.json().catch(() => null)) as typeof body;
  } catch {
    throw new SaveError('unavailable', MSG.devGone);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const message = typeof body?.error === 'string' && body.error ? body.error : `HTTP ${res.status}`;
    // Like claude.ai, the endpoint only takes a save made from the version the repo has now.
    if (res.status === 409) throw new SaveError('conflict', MSG.devConflict(message));
    throw new SaveError(res.status === 413 ? 'too_large' : 'failed', MSG.devRefused(message));
  }
  // Values the game's rules had to clamp or drop (the Studio normally never sends any).
  if (Array.isArray(body?.warnings)) for (const warning of body.warnings) console.warn(`[tuning] ${String(warning)}`);
  return { reloads: true };
}

// ---- exporting ---------------------------------------------------------------------------------

/**
 * Hands the tuning file to the developer to keep or send: a file download where the page may offer
 * one, else the clipboard, else `'shown'` (the caller shows the text for copying by hand; also when
 * the viewer declines claude.ai's download).
 */
export async function exportTuning(file: TuningFile): Promise<'downloaded' | 'copied' | 'shown'> {
  const filename = file.draftOf === undefined ? `copper-tuning-v${file.revision}.json` : `copper-tuning-draft-from-v${file.draftOf}.json`;
  const data = stringifyTuning(file);
  if (claudeRuntime()) {
    // Inside claude.ai's viewer a page can't download by itself: claude.ai offers the file.
    const downloads = await capability('downloads', EXPORT_WAIT_MS);
    if (downloads) {
      try {
        await downloads.save({ filename, data });
        return 'downloaded';
      } catch (e) {
        // The viewer said no: show the file rather than overwrite their clipboard behind their back.
        if (field(e, 'code') === 'declined') return 'shown';
        // Downloads are off in this view (or a prompt is already open): copying is the next best thing.
      }
    } else if (isTopLevel() && downloadLink(filename, data)) return 'downloaded';
  } else if (downloadLink(filename, data)) return 'downloaded';
  return (await copyText(data)) ? 'copied' : 'shown';
}

/** Downloads `data` through a temporary link. False where the page can't make one. */
function downloadLink(filename: string, data: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Some browsers start the download after click() returns, so the URL has to outlive it a while.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

/** Copies `text`. False where the page may not (no clipboard, not allowed in a frame, no focus). */
function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return Promise.resolve(false);
  return settle(
    Promise.resolve().then(() => navigator.clipboard.writeText(text)).then(() => true),
    CLIPBOARD_MS,
    false,
  );
}
