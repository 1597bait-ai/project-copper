// Tuning: the game's numbers as Copper Studio sees them (src/studio/), and how a saved set of
// changes is applied to the running game.
//
// The config modules (balance, characters, fixtures, materials, npcs) hold the values the code
// ships with. A TUNING FILE holds only what the developer changed in the Studio: it is embedded
// in the game page (<script type="application/json" id="copper-tuning">), and at boot, before
// the game starts, applyTuning() writes those changes INTO the live config objects. Every import
// of BALANCE, FIXTURES... therefore sees the tuned values without knowing tuning exists.
//
// Only fields listed in the Studio's schema (src/config/schema.ts) can be changed: anything else
// in a tuning file is ignored with a warning, and numbers are clamped to the schema's limits, so a
// bad file can never break the game.

import { ABILITIES, CHARACTERS } from './characters';
import { BALANCE } from './balance';
import { FIXTURES } from './fixtures';
import { MATERIALS } from './materials';
import { COWORKER_LINES, GRAVY_LINES, NPCS, STUDENT_LINES } from './npcs';
import { FIELD_BY_PATH, checkValue, describeChange } from './schema';

/** The live objects the game reads. Tuning changes them in place, so every import sees it. */
export const LIVE = {
  balance: BALANCE,
  materials: MATERIALS,
  fixtures: FIXTURES,
  characters: CHARACTERS,
  abilities: ABILITIES,
  npcs: NPCS,
  lines: { students: STUDENT_LINES, gravy: GRAVY_LINES, coworker: COWORKER_LINES },
};

export type Values = typeof LIVE;

/** Plain JSON. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

/** A nested object holding only changed values, keyed like {@link Values} ("balance.boss.sprintFactor"). */
export type Overrides = JsonObject;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The values the code ships with, captured before any tuning is applied. */
export const DEFAULTS: Values = clone(LIVE);

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value at a dotted path ("balance.boss.sprintFactor"), or undefined. */
export function getPath(root: unknown, path: string): unknown {
  let at: unknown = root;
  for (const key of path.split('.')) {
    if (!isObject(at) || !(key in at)) return undefined;
    at = at[key];
  }
  return at;
}

/** Sets a value at a dotted path, creating objects on the way (for override objects). */
export function setPath(root: JsonObject, path: string, value: Json): void {
  const keys = path.split('.');
  let at = root;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(at[key])) at[key] = {};
    at = at[key] as JsonObject;
  }
  at[keys[keys.length - 1]] = value;
}

/**
 * Writes `value` at `path` of a LIVE object without replacing the objects and arrays code may
 * hold on to (an array is refilled, not swapped). `null` removes an optional field (a fixture's
 * random yield range).
 */
function writeLive(root: JsonObject, path: string, value: Json): void {
  const keys = path.split('.');
  let at = root;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(at[key])) return; // a path the code doesn't have: nothing to change
    at = at[key] as JsonObject;
  }
  const last = keys[keys.length - 1];
  const current = at[last];
  if (value === null) delete at[last];
  else if (Array.isArray(current) && Array.isArray(value)) current.splice(0, current.length, ...clone(value));
  else at[last] = clone(value);
}

/** Puts every live object back to the shipped values, in place. */
function resetLive(target: JsonObject, source: JsonObject): void {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (isObject(value) && isObject(current)) resetLive(current, value);
    else if (Array.isArray(value) && Array.isArray(current)) current.splice(0, current.length, ...clone(value));
    else target[key] = clone(value);
  }
}

export interface Checked {
  /** The usable overrides (clamped and filtered). */
  values: Overrides;
  /** What was dropped or changed, in plain English. */
  warnings: string[];
}

/**
 * Keeps only overrides the schema allows, clamped to its limits. Never throws: anything odd is
 * dropped and reported, so a hand-edited or outdated tuning file can't break the game.
 */
export function checkOverrides(raw: unknown): Checked {
  const values: Overrides = {};
  const warnings: string[] = [];
  const walk = (node: unknown, prefix: string) => {
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const field = FIELD_BY_PATH.get(path);
      if (field) {
        const result = checkValue(field, value);
        if (result.ok) {
          if (result.note) warnings.push(`${field.label}: ${result.note}`);
          setPath(values, path, result.value);
        } else warnings.push(`Ignored ${path}: ${result.reason}`);
      } else if (isObject(value)) walk(value, path);
      else warnings.push(`Ignored ${path}: not something the Studio can change`);
    }
  };
  walk(raw, '');
  return { values, warnings };
}

/** Every changed path in an overrides object, with its value. */
export function flattenOverrides(overrides: Overrides): [string, Json][] {
  const out: [string, Json][] = [];
  const walk = (node: Json, prefix: string) => {
    if (FIELD_BY_PATH.has(prefix) || !isObject(node)) {
      if (prefix) out.push([prefix, node]);
      return;
    }
    for (const [key, value] of Object.entries(node)) walk(value, prefix ? `${prefix}.${key}` : key);
  };
  walk(overrides, '');
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The overrides that turn `base` into `values`: every schema field whose value differs. */
export function diffValues(values: unknown, base: Values = DEFAULTS): Overrides {
  const out: Overrides = {};
  for (const [path] of FIELD_BY_PATH) {
    const now = getPath(values, path);
    const was = getPath(base, path);
    if (now === undefined && was === undefined) continue;
    if (!same(now, was)) setPath(out, path, now === undefined ? null : clone(now as Json));
  }
  return out;
}

/** The shipped values with `overrides` on top (a fresh object; the live game is untouched). */
export function valuesWith(overrides: Overrides): Values {
  const out = clone(DEFAULTS) as unknown as JsonObject;
  for (const [path, value] of flattenOverrides(checkOverrides(overrides).values)) writeLive(out, path, value);
  return out as unknown as Values;
}

/** Lines like "Mr. Gravy › Speed: 2 → 1.5", one per changed field, for the save history. */
export function describeChanges(from: Values, to: Values): string[] {
  const out: string[] = [];
  for (const [path, field] of FIELD_BY_PATH) {
    const a = getPath(from, path);
    const b = getPath(to, path);
    if (!same(a, b)) out.push(describeChange(field, a, b));
  }
  return out;
}

// ---- the tuning file ---------------------------------------------------------------

export const TUNING_FORMAT = 'copper-tuning';
/** Saves kept in a tuning file's history. */
export const HISTORY_LIMIT = 30;

export interface TuningHistoryEntry {
  revision: number;
  savedAt: string;
  note: string;
  /** What changed in that save ("Mr. Gravy › Speed: 2 → 1.5"). */
  changes: string[];
  /** That save's values and map, so the Studio can load an older version back. */
  values: Overrides;
  map: string | null;
}

export interface TuningFile {
  format: typeof TUNING_FORMAT;
  version: 1;
  /** Counts saves. The game shows it as the balance version, so testers can say what they played. */
  revision: number;
  /** ISO time of the last save, or null for the values the code ships with. */
  savedAt: string | null;
  /** The developer's note for the last save. */
  note: string;
  /** Only the values that differ from the code's defaults. */
  values: Overrides;
  /** The school map (text format, see src/world/mapText.ts) when it differs from the built-in one. */
  map: string | null;
  /** The latest saves, newest first. */
  history: TuningHistoryEntry[];
}

export function emptyTuning(): TuningFile {
  return { format: TUNING_FORMAT, version: 1, revision: 0, savedAt: null, note: '', values: {}, map: null, history: [] };
}

/**
 * Reads a tuning file. Never throws: broken JSON gives the shipped values and a warning, unknown
 * or out-of-range values are dropped or clamped (see {@link checkOverrides}).
 */
export function parseTuning(text: string | null | undefined): { file: TuningFile; warnings: string[] } {
  const file = emptyTuning();
  if (!text || !text.trim()) return { file, warnings: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { file, warnings: ['The saved tuning is not valid JSON, so the game uses its built-in values.'] };
  }
  if (!isObject(raw)) return { file, warnings: ['The saved tuning is not a tuning file, so the game uses its built-in values.'] };
  const warnings: string[] = [];
  if (raw.format !== undefined && raw.format !== TUNING_FORMAT) warnings.push(`Unexpected format "${String(raw.format)}"; reading it anyway.`);
  const checked = checkOverrides(raw.values ?? {});
  warnings.push(...checked.warnings);
  file.values = checked.values;
  if (typeof raw.revision === 'number' && Number.isFinite(raw.revision)) file.revision = Math.max(0, Math.floor(raw.revision));
  if (typeof raw.savedAt === 'string') file.savedAt = raw.savedAt;
  if (typeof raw.note === 'string') file.note = raw.note.slice(0, 500);
  if (typeof raw.map === 'string' && raw.map.trim()) file.map = raw.map;
  if (Array.isArray(raw.history)) {
    file.history = raw.history
      .filter(isObject)
      .map((h) => ({
        revision: typeof h.revision === 'number' ? h.revision : 0,
        savedAt: typeof h.savedAt === 'string' ? h.savedAt : '',
        note: typeof h.note === 'string' ? h.note.slice(0, 500) : '',
        changes: Array.isArray(h.changes) ? h.changes.filter((c): c is string => typeof c === 'string').slice(0, 200) : [],
        values: checkOverrides(h.values ?? {}).values,
        map: typeof h.map === 'string' && h.map.trim() ? h.map : null,
      }))
      .slice(0, HISTORY_LIMIT);
  }
  return { file, warnings };
}

/** The tuning file as text (stable key order, readable diffs in git). */
export function stringifyTuning(file: TuningFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export interface SaveInput {
  /** The full values the developer wants (the Studio's draft). */
  values: Values;
  /** The map text, or null for the built-in map. */
  map: string | null;
  note: string;
  /** The tuning file being replaced (its revision and history carry on). */
  previous: TuningFile;
  /** ISO time; passed in so saves are testable. */
  now: string;
  /** The built-in map, to tell whether `map` is a change. */
  builtInMap: string;
}

/** The tuning file a save writes: overrides against the code's defaults, one more revision, history on top. */
export function makeSave(input: SaveInput): TuningFile {
  const { values, previous, now } = input;
  const before = valuesWith(previous.values);
  const changes = describeChanges(before, values);
  const mapChanged = (input.map ?? input.builtInMap) !== (previous.map ?? input.builtInMap);
  if (mapChanged) changes.push(input.map === null || input.map === input.builtInMap ? 'Map › back to the built-in school' : 'Map › edited');
  const revision = previous.revision + 1;
  const note = input.note.trim().slice(0, 500);
  const overrides = diffValues(values);
  const map = input.map === null || input.map === input.builtInMap ? null : input.map;
  return {
    format: TUNING_FORMAT,
    version: 1,
    revision,
    savedAt: now,
    note,
    values: overrides,
    map,
    history: [{ revision, savedAt: now, note, changes, values: overrides, map }, ...previous.history].slice(0, HISTORY_LIMIT),
  };
}

// ---- the running game ----------------------------------------------------------------

let active: TuningFile = emptyTuning();

/**
 * Applies a tuning file to the live config (everything the file doesn't mention goes back to the
 * shipped value first). Call before a shift starts; scenes read the config when they start.
 */
export function applyTuning(file: TuningFile): string[] {
  const checked = checkOverrides(file.values);
  resetLive(LIVE as unknown as JsonObject, clone(DEFAULTS) as unknown as JsonObject);
  for (const [path, value] of flattenOverrides(checked.values)) writeLive(LIVE as unknown as JsonObject, path, value);
  active = { ...file, values: checked.values };
  return checked.warnings;
}

/** The tuning file the game is running with. */
export function activeTuning(): TuningFile {
  return active;
}

/** The tuned school map, or null to play the built-in one. */
export function tunedMapText(): string | null {
  return active.map;
}

/** The id of the <script type="application/json"> that carries the tuning file in the page. */
export const TUNING_ELEMENT_ID = 'copper-tuning';

/** The tuning file embedded in a page, or the shipped values when there is none. */
export function readEmbeddedTuning(doc: Document = document): { file: TuningFile; warnings: string[] } {
  return parseTuning(doc.getElementById(TUNING_ELEMENT_ID)?.textContent);
}
