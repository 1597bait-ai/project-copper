// The Studio's draft: the values and map being worked on before they're saved to the game, and
// how it is kept in the browser between visits. Nothing here touches the DOM or Phaser, so it is
// all unit tested (draft.test.ts).

import { FIELDS, FIELD_BY_PATH, SECTIONS, checkValue } from '../config/schema';
import { checkOverrides, describeChanges, diffValues, getPath, setPath, valuesWith, type Json, type Overrides, type TuningFile, type Values } from '../config/tuning';
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

export interface StudioSession {
  /** The tab that was open: a section id, 'map' or 'history'. */
  tab: string;
  /** The crew member picked for play tests. */
  crew: string;
  /** Set when the page reloads because of a save: the version it wrote, and where. */
  saving?: { revision: number; target: string };
  /** The save was refused: someone saved a newer version first. */
  conflict?: boolean;
  /** Date.now() when stashed. */
  at: number;
}

export function stashSession(store: KeyValue | null, session: StudioSession): boolean {
  return writeJson(store, SESSION_KEY, session);
}

/** Reads the stash once (it is removed), or null when there is none or it is too old. */
export function takeSession(store: KeyValue | null, now: number): StudioSession | null {
  const raw = readJson(store, SESSION_KEY);
  removeKey(store, SESSION_KEY);
  if (!isObject(raw) || typeof raw.at !== 'number' || now - raw.at > SESSION_MAX_AGE_MS || now < raw.at - 60_000) return null;
  const saving = isObject(raw.saving) && typeof raw.saving.revision === 'number' ? { revision: raw.saving.revision, target: String(raw.saving.target ?? '') } : undefined;
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
