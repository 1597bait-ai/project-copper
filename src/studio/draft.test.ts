import { describe, expect, it } from 'vitest';
import { DEFAULTS, emptyTuning, getPath, makeSave, parseTuning, stringifyTuning, valuesWith, type TuningFile } from '../config/tuning';
import { paint } from '../world/editing';
import { parseMap, serializeMap } from '../world/mapText';
import { DEFAULT_MAP } from '../world/maps';
import {
  DRAFT_KEY,
  LEGACY_EDITOR_KEYS,
  MAP_PATH,
  SESSION_KEY,
  SESSION_MAX_AGE_MS,
  SESSION_RELOAD_MS,
  changeLines,
  changedPaths,
  clearSession,
  countBySection,
  draftFrom,
  exportedDraft,
  loadDraft,
  mapsDiffer,
  mergeDrafts,
  normalizeMap,
  parseStoredDraft,
  rebaseDraft,
  sameDraft,
  saveLanded,
  stashSession,
  storeDraft,
  takeLegacyEditorMap,
  takeSession,
  versionOf,
  withValue,
} from './draft';
import type { KeyValue } from './storage';

const BUILT_IN = DEFAULT_MAP.text;
const built = parseMap(BUILT_IN);
/** The built-in school with one copper pile painted in the first hallway tile found. */
const EDITED = (() => {
  for (let y = 0; y < built.height; y++) {
    const x = built.rows[y].indexOf('.');
    if (x >= 0) {
      const r = paint(built.rows, x, y, 'c');
      if (r.changed) return serializeMap(r.rows, built.names);
    }
  }
  throw new Error('no hallway tile');
})();

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const store: KeyValue = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { store, map };
}
const blocked: KeyValue = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const saved = (values: TuningFile['values'], map: string | null = null, revision = 3): TuningFile => ({ ...emptyTuning(), revision, values, map, savedAt: '2026-10-12T12:00:00Z' });

describe('the draft', () => {
  it('starts as the saved version', () => {
    const d = draftFrom(saved({ npcs: { mr_gravy: { speed: 1.5 } } }, EDITED), BUILT_IN);
    expect(d).toEqual({ values: { npcs: { mr_gravy: { speed: 1.5 } } }, map: EDITED, note: '', baseRevision: 3 });
  });

  it('keeps overrides minimal: a value put back to the shipped one stops being one', () => {
    let d = draftFrom(emptyTuning(), BUILT_IN);
    d = withValue(d, 'npcs.mr_gravy.speed', 1.5);
    d = withValue(d, 'balance.boss.chaseAt', 0.5);
    expect(d.values).toEqual({ npcs: { mr_gravy: { speed: 1.5 } }, balance: { boss: { chaseAt: 0.5 } } });
    d = withValue(d, 'npcs.mr_gravy.speed', DEFAULTS.npcs.mr_gravy.speed);
    expect(d.values).toEqual({ balance: { boss: { chaseAt: 0.5 } } });
  });

  it('goes through the schema: clamped, and refused values leave it alone', () => {
    const d = draftFrom(emptyTuning(), BUILT_IN);
    expect(withValue(d, 'npcs.mr_gravy.speed', 99).values).toEqual({ npcs: { mr_gravy: { speed: 8 } } });
    expect(withValue(d, 'npcs.mr_gravy.speed', 'fast')).toBe(d);
    expect(withValue(d, 'balance.secretCheat', 1)).toBe(d);
    expect(withValue(d, 'characters.dalton.name', '   ')).toBe(d);
    // The same value again is no change at all.
    expect(withValue(d, 'npcs.mr_gravy.speed', DEFAULTS.npcs.mr_gravy.speed)).toBe(d);
  });

  it('switches an optional range off and back on', () => {
    let d = withValue(draftFrom(emptyTuning(), BUILT_IN), 'fixtures.desk.range', null);
    expect(d.values).toEqual({ fixtures: { desk: { range: null } } });
    expect(getPath(valuesWith(d.values), 'fixtures.desk.range')).toBeUndefined();
    d = withValue(d, 'fixtures.desk.range', DEFAULTS.fixtures.desk.range);
    expect(d.values).toEqual({});
  });

  it('counts changes against the saved version, not the shipped one', () => {
    const file = saved({ npcs: { mr_gravy: { speed: 1.5 } } });
    const savedValues = valuesWith(file.values);
    let d = draftFrom(file, BUILT_IN);
    expect(changedPaths(valuesWith(d.values), savedValues)).toEqual([]);
    d = withValue(d, 'npcs.mr_gravy.speed', 3);
    d = withValue(d, 'balance.students.hangouts', ['hallway']);
    expect(changedPaths(valuesWith(d.values), savedValues)).toEqual(['npcs.mr_gravy.speed', 'balance.students.hangouts']);
    expect(countBySection(['npcs.mr_gravy.speed', 'balance.students.hangouts'])).toMatchObject({ gravy: 1, students: 1, crew: 0, loot: 0 });
  });

  it('treats a reformatted built-in map as the built-in map', () => {
    const reformatted = serializeMap(built.rows, built.names);
    expect(reformatted).not.toBe(BUILT_IN);
    expect(normalizeMap(reformatted, BUILT_IN)).toBeNull();
    expect(normalizeMap('  ', BUILT_IN)).toBeNull();
    expect(normalizeMap(EDITED, BUILT_IN)).toBe(EDITED);
    expect(mapsDiffer(null, reformatted, BUILT_IN)).toBe(false);
    expect(mapsDiffer(null, EDITED, BUILT_IN)).toBe(true);
  });

  it('lists changes the way a save records them, map included', () => {
    const from = { values: DEFAULTS, map: null };
    const to = { values: valuesWith({ npcs: { mr_gravy: { speed: 1.5 } } }), map: EDITED };
    const lines = changeLines(from, to, BUILT_IN);
    expect(lines).toEqual(['Mr. Gravy › Stats › Speed: 2 → 1.5', 'Map › edited']);
    expect(changeLines(to, from, BUILT_IN)).toContain('Map › back to the built-in school');
    // The same lines a save writes into the history.
    const file = makeSave({ values: to.values, map: to.map, note: '', previous: emptyTuning(), now: 'now', builtInMap: BUILT_IN });
    expect(file.history[0].changes).toEqual(lines);
  });
});

describe('a newer version saved since the draft started', () => {
  const save = (previous: TuningFile, overrides: TuningFile['values'], map: string | null = null) =>
    makeSave({ values: valuesWith(overrides), map, note: '', previous, now: '2026-10-12T12:00:00Z', builtInMap: BUILT_IN });
  const v1 = save(emptyTuning(), { npcs: { mr_gravy: { speed: 1.5 } } });
  const v2 = save(v1, { npcs: { mr_gravy: { speed: 1.25 } } });
  /** The built-in school with a plant on the last hallway tile: a second, different map edit. */
  const OTHER = (() => {
    for (let y = built.height - 1; y >= 0; y--) {
      const x = built.rows[y].lastIndexOf('.');
      const r = x >= 0 ? paint(built.rows, x, y, '*') : null;
      if (r?.changed) return serializeMap(r.rows, built.names);
    }
    throw new Error('no hallway tile');
  })();

  it("finds each version's values", () => {
    expect(versionOf(v2, 2)).toEqual({ values: v2.values, map: null });
    expect(versionOf(v2, 1)).toEqual({ values: { npcs: { mr_gravy: { speed: 1.5 } } }, map: BUILT_IN });
    expect(versionOf(v2, 0)).toEqual({ values: {}, map: null });
    expect(versionOf(v2, 7)).toBeNull();
  });

  it('brings a version saved on the built-in school back on that school, after the built-in one changed', () => {
    // A dev server save (or a pull) wrote another map into the map file: OTHER is the built-in one now.
    expect(normalizeMap(versionOf(v2, 1)!.map, OTHER)).toBe(BUILT_IN);
    expect(normalizeMap(versionOf(v2, 1)!.map, BUILT_IN)).toBeNull();
  });

  it('moves a draft that was only looked at onto the newer version', () => {
    const looked = draftFrom(emptyTuning(), BUILT_IN);
    expect(rebaseDraft(looked, versionOf(v2, 0)!, v2, BUILT_IN)).toEqual({ draft: { ...looked, values: v2.values, baseRevision: 2 }, kept: [], clashes: [] });
  });

  it("keeps the draft's own edits on top of it", () => {
    const mine = { ...withValue(draftFrom(v1, BUILT_IN), 'npcs.student.speed', 3), map: EDITED };
    const r = rebaseDraft(mine, versionOf(v2, 1)!, v2, BUILT_IN);
    expect(r.draft).toEqual({ ...mine, values: { npcs: { mr_gravy: { speed: 1.25 }, student: { speed: 3 } } }, baseRevision: 2 });
    expect(r.kept).toEqual(['npcs.student.speed', MAP_PATH]);
    expect(r.clashes).toEqual([]);
  });

  it("says when the newer version changed the same thing (the draft's value stays)", () => {
    const mine = withValue(draftFrom(v1, BUILT_IN), 'npcs.mr_gravy.speed', 1.75);
    const r = rebaseDraft(mine, versionOf(v2, 1)!, v2, BUILT_IN);
    expect(getPath(valuesWith(r.draft.values), 'npcs.mr_gravy.speed')).toBe(1.75);
    expect(r.clashes).toEqual(['npcs.mr_gravy.speed']);
    // The same edit on both sides leaves nothing to keep.
    const both = withValue(draftFrom(v1, BUILT_IN), 'npcs.mr_gravy.speed', 1.25);
    expect(rebaseDraft(both, versionOf(v2, 1)!, v2, BUILT_IN)).toMatchObject({ kept: [], clashes: [] });
  });

  it('keeps an optional range switched off', () => {
    const mine = withValue(draftFrom(v1, BUILT_IN), 'fixtures.desk.range', null);
    expect(rebaseDraft(mine, versionOf(v2, 1)!, v2, BUILT_IN).draft.values).toEqual({ npcs: { mr_gravy: { speed: 1.25 } }, fixtures: { desk: { range: null } } });
  });

  it('says when both edited the map, also on the dev server (where a saved map becomes the built-in one)', () => {
    const theirs = save(emptyTuning(), {}, OTHER);
    const mine = { ...draftFrom(emptyTuning(), BUILT_IN), map: EDITED };
    expect(rebaseDraft(mine, versionOf(theirs, 0)!, theirs, BUILT_IN)).toMatchObject({ draft: { map: EDITED }, kept: [MAP_PATH], clashes: [MAP_PATH] });
    // The dev server wrote their map into the map file (the built-in one now): only the history tells.
    const dev = { ...theirs, map: null };
    expect(rebaseDraft(mine, versionOf(dev, 0)!, dev, OTHER)).toMatchObject({ kept: [MAP_PATH], clashes: [MAP_PATH] });
    // An untouched map follows theirs.
    expect(rebaseDraft(draftFrom(emptyTuning(), BUILT_IN), versionOf(theirs, 0)!, theirs, BUILT_IN).draft.map).toBe(OTHER);
  });
});

describe('keeping the draft in the browser', () => {
  it('stores it and loads it back', () => {
    const { store, map } = memory();
    const d = { ...withValue(draftFrom(saved({}, null, 2), BUILT_IN), 'npcs.mr_gravy.speed', 1.5), map: EDITED, note: 'slower' };
    expect(storeDraft(store, d, '2026-10-12T12:00:00Z')).toBe(true);
    expect(map.has(DRAFT_KEY)).toBe(true);
    expect(loadDraft(store, BUILT_IN)).toEqual(d);
  });

  it('works without storage', () => {
    const d = draftFrom(emptyTuning(), BUILT_IN);
    expect(storeDraft(null, d, 'now')).toBe(false);
    expect(storeDraft(blocked, d, 'now')).toBe(false);
    expect(loadDraft(null, BUILT_IN)).toBeNull();
    expect(loadDraft(blocked, BUILT_IN)).toBeNull();
  });

  it('checks a stored draft like a tuning file', () => {
    const raw = { format: 'copper-studio-draft', values: { npcs: { mr_gravy: { speed: 99, flying: true } } }, map: 42, note: 7, baseRevision: -3 };
    expect(parseStoredDraft(raw, BUILT_IN)).toEqual({ values: { npcs: { mr_gravy: { speed: 8 } } }, map: null, note: '', baseRevision: 0 });
    expect(parseStoredDraft({ values: {} }, BUILT_IN)).toBeNull();
    expect(parseStoredDraft('nope', BUILT_IN)).toBeNull();
    const { store } = memory({ [DRAFT_KEY]: '{not json' });
    expect(loadDraft(store, BUILT_IN)).toBeNull();
  });
});

describe('exporting the draft', () => {
  it('marks it as a draft of the saved version, never a version of its own', () => {
    const file = saved({ npcs: { mr_gravy: { speed: 1.5 } } }, null, 4);
    const draft = { ...withValue(draftFrom(file, BUILT_IN), 'npcs.student.speed', 3), map: EDITED, note: 'students faster' };
    const out = exportedDraft(draft, file, '2026-10-13T14:01:00.000Z');
    expect(out).toMatchObject({ revision: 4, draftOf: 4, exportedAt: '2026-10-13T14:01:00.000Z', savedAt: null, note: 'students faster', map: EDITED, history: [] });
    expect(getPath(valuesWith(out.values), 'npcs.student.speed')).toBe(3);
    // Read back (Import), it is still a draft of version 4.
    expect(parseTuning(stringifyTuning(out)).file).toEqual(out);
  });
});

describe('two tabs keeping one draft', () => {
  const base = draftFrom(saved({ npcs: { mr_gravy: { speed: 1.5 } } }), BUILT_IN);

  it('tells drafts apart by values, map, note and version (not by how the map is written)', () => {
    expect(sameDraft(base, { ...base }, BUILT_IN)).toBe(true);
    expect(sameDraft(base, withValue(base, 'npcs.student.speed', 3), BUILT_IN)).toBe(false);
    expect(sameDraft(base, { ...base, note: 'x' }, BUILT_IN)).toBe(false);
    expect(sameDraft(base, { ...base, baseRevision: 4 }, BUILT_IN)).toBe(false);
    expect(sameDraft(base, { ...base, map: EDITED }, BUILT_IN)).toBe(false);
    expect(sameDraft(base, { ...base, map: serializeMap(built.rows, built.names) }, BUILT_IN)).toBe(true);
  });

  it("keeps both tabs' edits: theirs, with this tab's on top", () => {
    const mine = { ...withValue(base, 'npcs.student.speed', 3), note: 'students faster' };
    const theirs = { ...withValue(base, 'characters.dalton.stats.speed', 4), map: EDITED };
    const merged = mergeDrafts(base, mine, theirs, BUILT_IN);
    const values = valuesWith(merged.values);
    expect(getPath(values, 'npcs.student.speed')).toBe(3);
    expect(getPath(values, 'characters.dalton.stats.speed')).toBe(4);
    expect(getPath(values, 'npcs.mr_gravy.speed')).toBe(1.5);
    expect(merged).toMatchObject({ map: EDITED, note: 'students faster', baseRevision: 3 });
  });

  it("lets this tab's edit win where both changed the same thing, an optional range switched off included", () => {
    const mine = withValue(withValue(base, 'npcs.mr_gravy.speed', 1.25), 'fixtures.desk.range', null);
    const theirs = withValue(base, 'npcs.mr_gravy.speed', 3);
    const merged = mergeDrafts(base, mine, theirs, BUILT_IN);
    expect(merged.values).toEqual({ npcs: { mr_gravy: { speed: 1.25 } }, fixtures: { desk: { range: null } } });
    // An edit put back to where this tab started is no edit: theirs stays.
    expect(mergeDrafts(base, { ...base }, theirs, BUILT_IN)).toEqual(theirs);
  });

  it("a tab with no edits of its own takes the other tab's draft whole, its version too", () => {
    const theirs = { ...withValue(base, 'balance.shift.lengthSeconds', 420), map: EDITED, note: 'longer', baseRevision: 4 };
    expect(mergeDrafts(base, base, theirs, BUILT_IN)).toEqual(theirs);
  });
});

describe('telling whether a save landed', () => {
  const v1 = makeSave({ values: valuesWith({ npcs: { mr_gravy: { speed: 1.5 } } }), map: null, note: 'mine', previous: emptyTuning(), now: '2026-10-12T12:00:00.000Z', builtInMap: BUILT_IN });
  const v2 = makeSave({ values: DEFAULTS, map: null, note: 'later', previous: v1, now: '2026-10-12T13:00:00.000Z', builtInMap: BUILT_IN });

  it('finds the save by its number and its time, also once newer versions are on top', () => {
    expect(saveLanded(v1, { revision: 1, savedAt: v1.savedAt! })).toBe(true);
    expect(saveLanded(v2, { revision: 1, savedAt: v1.savedAt! })).toBe(true);
  });

  it("doesn't take someone else's version with the same number for it", () => {
    expect(saveLanded(v1, { revision: 1, savedAt: '2026-10-12T12:00:00.001Z' })).toBe(false);
    expect(saveLanded(emptyTuning(), { revision: 1, savedAt: v1.savedAt! })).toBe(false);
  });

  it('goes by the number alone for a stash without a time', () => {
    expect(saveLanded(v2, { revision: 1 })).toBe(true);
    expect(saveLanded(emptyTuning(), { revision: 1 })).toBe(false);
  });
});

describe('reopening after a save', () => {
  it('uses the stash up, except for a second reload straight after the first', () => {
    const { store, map } = memory();
    const session = { tab: 'gravy', crew: 'tomothy', saving: { revision: 4, target: 'dev' }, at: 1000 };
    expect(stashSession(store, session)).toBe(true);
    expect(takeSession(store, 2000)).toEqual({ ...session, conflict: false });
    // The dev server reloads again after a map save: that load still reopens the Studio.
    expect(takeSession(store, 2000 + SESSION_RELOAD_MS)).toEqual({ ...session, conflict: false });
    // Any later reload doesn't.
    expect(takeSession(store, 2001 + SESSION_RELOAD_MS)).toBeNull();
    expect(map.size).toBe(0);
    expect(takeSession(store, 2002 + SESSION_RELOAD_MS)).toBeNull();
  });

  it("keeps the save's time and the refusal", () => {
    const { store } = memory();
    const session = { tab: 'gravy', crew: 'dalton', saving: { revision: 4, target: 'artifact', savedAt: '2026-10-12T12:00:00.000Z' }, conflict: true, at: 1000 };
    stashSession(store, session);
    expect(takeSession(store, 2000)).toEqual(session);
  });

  it('is forgotten when the Studio closes', () => {
    const { store } = memory();
    stashSession(store, { tab: 'map', crew: 'dalton', at: 1000 });
    expect(takeSession(store, 1500)).not.toBeNull();
    clearSession(store);
    expect(takeSession(store, 1600)).toBeNull();
  });

  it('ignores an old or broken stash', () => {
    const { store } = memory({ [SESSION_KEY]: JSON.stringify({ tab: 'map', crew: 'dalton', at: 0 }) });
    expect(takeSession(store, SESSION_MAX_AGE_MS + 1)).toBeNull();
    expect(takeSession(memory({ [SESSION_KEY]: '[]' }).store, 0)).toBeNull();
    expect(takeSession(blocked, 0)).toBeNull();
    expect(takeSession(null, 0)).toBeNull();
  });
});

describe("the old map editor's work", () => {
  it('moves an edited map over, once', () => {
    const { store, map } = memory({ [LEGACY_EDITOR_KEYS.map]: EDITED, [LEGACY_EDITOR_KEYS.base]: BUILT_IN });
    expect(takeLegacyEditorMap(store, BUILT_IN)).toBe(EDITED);
    expect(map.size).toBe(0);
    expect(takeLegacyEditorMap(store, BUILT_IN)).toBeNull();
  });

  it('ignores an unedited copy, and blocked storage', () => {
    const { store, map } = memory({ [LEGACY_EDITOR_KEYS.map]: serializeMap(built.rows, built.names) });
    expect(takeLegacyEditorMap(store, BUILT_IN)).toBeNull();
    expect(map.size).toBe(0);
    expect(takeLegacyEditorMap(blocked, BUILT_IN)).toBeNull();
  });
});
