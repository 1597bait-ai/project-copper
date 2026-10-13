// The Studio's draft: the values and map being worked on before they're saved to the game, and
// how it is kept in the browser between visits. Nothing here touches the DOM or Phaser, so it is
// all unit tested (draft.test.ts).

import { FIELDS, FIELD_BY_PATH, SECTIONS, checkValue } from '../config/schema';
import { TUNING_FORMAT, checkOverrides, describeChanges, diffValues, getPath, setPath, valuesWith, type Json, type Overrides, type TuningFile, type Values } from '../config/tuning';
import { sameMap } from '../world/editing';
import { readJson, readText, removeKey, writeJson, type KeyValue } from './storage';

export interface Draft {
  /** Overrides against the shipped values, like a tuning file's `values`. */
  values: Overrides;
  /** The school map, or null for the built-in one. */
  map: string | null;
  /** The note for the next save. */
  note: string;
  /** The saved version this draft started from (0 = the shipped values). */
  baseRevision: number;
}

type JsonObject = { [key: string]: Json };
const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ---- maps -----------------------------------------------------------------------------

// Comparing maps parses both, and the header asks on every edit: remember the last answers.
const sameCache = new Map<string, boolean>();
function sameText(a: string, b: string): boolean {
  if (a === b) return true;
  const key = a.length < b.length ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  let hit = sameCache.get(key);
  if (hit === undefined) {
    hit = sameMap(a, b);
    if (sameCache.size > 32) sameCache.clear();
    sameCache.set(key, hit);
  }
  return hit;
}

/** null when `map` is the built-in school (whatever its comments or formatting), else the map. */
export function normalizeMap(map: string | null | undefined, builtIn: string): string | null {
  if (typeof map !== 'string' || !map.trim()) return null;
  return sameText(map, builtIn) ? null : map;
}

/** True when two maps differ in grid or room names (null = the built-in school). */
export function mapsDiffer(a: string | null, b: string | null, builtIn: string): boolean {
  return !sameText(a ?? builtIn, b ?? builtIn);
}

// ---- the draft ------------------------------------------------------------------------

/** A draft that starts as a saved tuning file. */
export function draftFrom(file: TuningFile, builtIn: string): Draft {
  return { values: checkOverrides(file.values).values, map: normalizeMap(file.map, builtIn), note: '', baseRevision: file.revision };
}

function deletePath(root: JsonObject, path: string): void {
  const keys = path.split('.');
  let at: Json = root;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(at)) return;
    at = at[key];
  }
  if (isObject(at)) delete at[keys[keys.length - 1]];
}

/**
 * The draft with one field changed (null switches an optional field off). The value is checked
 * against the schema first: anything it refuses leaves the draft as it was (the same object).
 * The overrides stay minimal: a value put back to the shipped one stops being an override.
 */
export function withValue(draft: Draft, path: string, value: unknown): Draft {
  const field = FIELD_BY_PATH.get(path);
  if (!field) return draft;
  const checked = checkValue(field, value);
  if (!checked.ok) return draft;
  const values = valuesWith(draft.values) as unknown as JsonObject;
  if (same(getPath(values, path), checked.value)) return draft;
  if (checked.value === null) deletePath(values, path);
  else setPath(values, path, checked.value as Json);
  return { ...draft, values: diffValues(values) };
}

/** Schema fields whose value differs between two sets of values (in schema order). */
export function changedPaths(a: Values, b: Values): string[] {
  return FIELDS.filter((f) => !same(getPath(a, f.path), getPath(b, f.path))).map((f) => f.path);
}

/** How many of `paths` belong to each section (by section id). */
export function countBySection(paths: readonly string[]): Record<string, number> {
  const wanted = new Set(paths);
  const out: Record<string, number> = {};
  for (const s of SECTIONS) out[s.id] = s.groups.reduce((n, g) => n + g.fields.filter((f) => wanted.has(f.path)).length, 0);
  return out;
}

/** "Map › edited" / "Map › back to the built-in school" when the map changed, like a save records it. */
export function mapChangeLine(from: string | null, to: string | null, builtIn: string): string | null {
  if (!mapsDiffer(from, to, builtIn)) return null;
  return to === null ? 'Map › back to the built-in school' : 'Map › edited';
}

/** Every change from `from` to `to`, as the save dialog and the history list them. */
export function changeLines(from: { values: Values; map: string | null }, to: { values: Values; map: string | null }, builtIn: string): string[] {
  const lines = describeChanges(from.values, to.values);
  const map = mapChangeLine(from.map, to.map, builtIn);
  if (map) lines.push(map);
  return lines;
}

/**
 * The draft as a tuning file to keep or send (Export), marked as a draft of the saved version: only
 * Save to game makes versions, so it gets no number or history entry of its own. Import reads it
 * back; tools/artifact-page.mjs pull refuses it.
 */
export function exportedDraft(draft: Draft, saved: TuningFile, now: string): TuningFile {
  return {
    format: TUNING_FORMAT,
    version: 1,
    revision: saved.revision,
    draftOf: saved.revision,
    exportedAt: now,
    savedAt: null,
    note: draft.note,
    values: checkOverrides(draft.values).values,
    map: draft.map,
    history: [],
  };
}

// ---- a newer version saved since the draft started --------------------------------------

/** A saved version's values and map: 0 is the shipped values, older ones come from the history (null once dropped from it). */
export function versionOf(file: TuningFile, revision: number): { values: Overrides; map: string | null } | null {
  if (revision === file.revision) return { values: file.values, map: file.map };
  if (revision === 0) return { values: {}, map: null };
  const entry = file.history.find((h) => h.revision === revision);
  return entry ? { values: entry.values, map: entry.map } : null;
}

/** The map in a "kept" or "clashes" list. */
export const MAP_PATH = 'map';

export interface Rebased {
  draft: Draft;
  /** The draft's own edits that still differ from the newer version (field paths, and MAP_PATH). */
  kept: string[];
  /** Kept edits to something the newer version changed too: the draft's value replaced theirs. */
  clashes: string[];
}

/**
 * Moves a draft started from an older version (`base`) onto the newer saved one, like a merge:
 * whatever the draft didn't change takes the newer version's value, and the draft's own edits stay
 * on top. Without this, a draft that was only looked at would undo the newer version when saved.
 */
export function rebaseDraft(draft: Draft, base: { values: Overrides; map: string | null }, saved: TuningFile, builtIn: string): Rebased {
  const from = valuesWith(base.values);
  const theirs = valuesWith(saved.values);
  const mine = valuesWith(draft.values);
  const out = valuesWith(saved.values) as unknown as JsonObject;
  const kept: string[] = [];
  const clashes: string[] = [];
  for (const f of FIELDS) {
    const was = getPath(from, f.path);
    const now = getPath(mine, f.path);
    const their = getPath(theirs, f.path);
    if (same(now, was) || same(now, their)) continue;
    kept.push(f.path);
    if (!same(their, was)) clashes.push(f.path);
    if (now === undefined || now === null) deletePath(out, f.path);
    else setPath(out, f.path, now as Json);
  }
  let map = normalizeMap(saved.map, builtIn);
  if (mapsDiffer(draft.map, base.map, builtIn) && mapsDiffer(draft.map, saved.map, builtIn)) {
    kept.push(MAP_PATH);
    // On the dev server a saved map becomes the built-in one, so the history says whether it changed.
    const theirMap = mapsDiffer(saved.map, base.map, builtIn) || saved.history.some((h) => h.revision > draft.baseRevision && h.changes.some((c) => c.startsWith('Map ›')));
    if (theirMap) clashes.push(MAP_PATH);
    map = draft.map;
  }
  return { draft: { ...draft, values: diffValues(out), map, baseRevision: saved.revision }, kept, clashes };
}

// ---- two tabs, one stored draft --------------------------------------------------------------

/** True when two drafts hold the same values, map, note and base version. */
export function sameDraft(a: Draft, b: Draft, builtIn: string): boolean {
  return (
    a.note === b.note &&
    a.baseRevision === b.baseRevision &&
    !mapsDiffer(a.map, b.map, builtIn) &&
    changedPaths(valuesWith(a.values), valuesWith(b.values)).length === 0
  );
}

/**
 * Every tab of the game keeps the same draft in the browser. When another tab stored it since this
 * one last read or wrote it (`base`), this is their draft with this tab's own edits on top (like
 * rebaseDraft): neither tab's edits are lost, and where both changed the same thing this tab's stays.
 */
export function mergeDrafts(base: Draft, mine: Draft, theirs: Draft, builtIn: string): Draft {
  const was = valuesWith(base.values);
  const now = valuesWith(mine.values);
  const out = valuesWith(theirs.values) as unknown as JsonObject;
  for (const f of FIELDS) {
    const value = getPath(now, f.path);
    if (same(value, getPath(was, f.path))) continue;
    if (value === undefined || value === null) deletePath(out, f.path);
    else setPath(out, f.path, value as Json);
  }
  return {
    values: diffValues(out),
    map: mapsDiffer(mine.map, base.map, builtIn) ? mine.map : theirs.map,
    note: mine.note !== base.note ? mine.note : theirs.note,
    baseRevision: mine.baseRevision !== base.baseRevision ? mine.baseRevision : theirs.baseRevision,
  };
}

// ---- keeping the draft between visits ------------------------------------------------------

export const DRAFT_KEY = 'project-copper/studio/draft/v1';
const DRAFT_FORMAT = 'copper-studio-draft';

/** The draft as stored: checked again when read, like any tuning file. */
export function parseStoredDraft(raw: unknown, builtIn: string): Draft | null {
  if (!isObject(raw) || raw.format !== DRAFT_FORMAT) return null;
  const base = raw.baseRevision;
  return {
    values: checkOverrides(raw.values ?? {}).values,
    map: normalizeMap(typeof raw.map === 'string' ? raw.map : null, builtIn),
    note: typeof raw.note === 'string' ? raw.note.slice(0, 500) : '',
    baseRevision: typeof base === 'number' && Number.isFinite(base) ? Math.max(0, Math.floor(base)) : 0,
  };
}

export function loadDraft(store: KeyValue | null, builtIn: string): Draft | null {
  return parseStoredDraft(readJson(store, DRAFT_KEY), builtIn);
}

/** False when the browser wouldn't keep it. */
export function storeDraft(store: KeyValue | null, draft: Draft, now: string): boolean {
  return writeJson(store, DRAFT_KEY, { format: DRAFT_FORMAT, version: 1, savedAt: now, ...draft });
}

export function clearDraft(store: KeyValue | null): void {
  removeKey(store, DRAFT_KEY);
}

// ---- reopening after a save reloads the page ----------------------------------------------

export const SESSION_KEY = 'project-copper/studio/session/v1';
/** A stash older than this (a tab restored hours later) doesn't reopen the Studio. */
export const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
/**
 * After the first page load reads the stash, it still counts for a reload this soon after: a dev
 * server save that wrote the map reloads the page twice (the Studio's reload, then Vite's own).
 */
export const SESSION_RELOAD_MS = 10_000;

export interface StudioSession {
  /** The tab that was open: a section id, 'map' or 'history'. */
  tab: string;
  /** The crew member picked for play tests. */
  crew: string;
  /** Set when the page reloads because of a save: the version it wrote, where, and its time (which tells it apart from anyone else's). */
  saving?: { revision: number; target: string; savedAt?: string };
  /** The save was refused: a newer version was saved first (by someone else, or by this save itself when its answer got lost). */
  conflict?: boolean;
  /** Date.now() when stashed. */
  at: number;
}

/**
 * Whether the save stashed in `saving` is in `file` (the version the page loaded): a version with
 * its number and its time, to the millisecond. A stash without a time: any version that new.
 */
export function saveLanded(file: TuningFile, saving: { revision: number; savedAt?: string }): boolean {
  if (!saving.savedAt) return file.revision >= saving.revision;
  const save = saving.revision === file.revision ? file : file.history.find((h) => h.revision === saving.revision);
  return save?.savedAt === saving.savedAt;
}

export function stashSession(store: KeyValue | null, session: StudioSession): boolean {
  return writeJson(store, SESSION_KEY, session);
}

/** Forgets the stash (the Studio was closed, or the save it was for failed). */
export function clearSession(store: KeyValue | null): void {
  removeKey(store, SESSION_KEY);
}

/**
 * The stash left for this page load, or null when there is none or it is too old. It is used up:
 * only a reload within {@link SESSION_RELOAD_MS} of the first read finds it again.
 */
export function takeSession(store: KeyValue | null, now: number): StudioSession | null {
  const raw = readJson(store, SESSION_KEY);
  if (!isObject(raw) || typeof raw.at !== 'number' || now - raw.at > SESSION_MAX_AGE_MS || now < raw.at - 60_000) {
    removeKey(store, SESSION_KEY);
    return null;
  }
  if (typeof raw.takenAt === 'number') {
    if (now - raw.takenAt > SESSION_RELOAD_MS || now < raw.takenAt) {
      removeKey(store, SESSION_KEY);
      return null;
    }
  } else if (!writeJson(store, SESSION_KEY, { ...raw, takenAt: now })) removeKey(store, SESSION_KEY);
  const saving =
    isObject(raw.saving) && typeof raw.saving.revision === 'number'
      ? { revision: raw.saving.revision, target: String(raw.saving.target ?? ''), ...(typeof raw.saving.savedAt === 'string' ? { savedAt: raw.saving.savedAt } : {}) }
      : undefined;
  return {
    tab: typeof raw.tab === 'string' ? raw.tab : '',
    crew: typeof raw.crew === 'string' ? raw.crew : '',
    saving,
    conflict: raw.conflict === true,
    at: raw.at,
  };
}

// ---- the old in-game map editor's working copy -------------------------------------------

/** Where the map editor kept its work before it moved into the Studio. */
export const LEGACY_EDITOR_KEYS = { map: 'project-copper/editor/map/v1', base: 'project-copper/editor/base/v1' };

/**
 * The map the old in-game editor left in this browser, if it is an actual edit (else null). The
 * old copy is removed either way, so it is only offered once.
 */
export function takeLegacyEditorMap(store: KeyValue | null, builtIn: string): string | null {
  const text = readText(store, LEGACY_EDITOR_KEYS.map);
  if (text === null) return null;
  removeKey(store, LEGACY_EDITOR_KEYS.map);
  removeKey(store, LEGACY_EDITOR_KEYS.base);
  return normalizeMap(text, builtIn);
}
