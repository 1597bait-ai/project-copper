import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE, bagCapacity, tilesPerSecond } from './balance';
import { FIXTURES } from './fixtures';
import { STUDENT_LINES } from './npcs';
import { FIELDS, FIELD_BY_PATH, checkValue, formatValue } from './schema';
import {
  DEFAULTS,
  HISTORY_LIMIT,
  activeTuning,
  applyTuning,
  checkOverrides,
  describeChanges,
  diffValues,
  emptyTuning,
  getPath,
  makeSave,
  parseTuning,
  stringifyTuning,
  tunedMapText,
  valuesWith,
  type Values,
} from './tuning';

afterEach(() => {
  applyTuning(emptyTuning());
});

/** Numbers and text in the tunable config that the Studio deliberately leaves alone (art keys, ids, colours, unused stats). */
const NOT_TUNABLE = [
  /\.id$/,
  /\.sprite$/,
  /\.variants$/,
  /\.color$/,
  /^fixtures\.[^.]+\.(solid|wallMounted|gravyTruck)$/,
  ...Object.values(FIXTURES)
    .filter((f) => f.gravyTruck)
    .map((f) => new RegExp(`^fixtures\\.${f.id}\\.recharge$`)), // Mr. Gravy's truck never comes back in a shift
  /^npcs\.student\.(awareness|name)$/, // students use their own vision settings and are never named
  /^npcs\.sleepy_coworker\.(speed|awareness)$/, // he shuffles at balance.sleepyCoworker.shuffleTilesPerSecond
  /^abilities\.[^.]+\.description$/, // nothing in the game shows it (yet), so tuning it would change nothing
];

function leaves(node: unknown, prefix = ''): [string, unknown][] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [[prefix, node]];
  if (FIELD_BY_PATH.has(prefix)) return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

describe('schema', () => {
  it('every field points at a value the game ships with', () => {
    // A fixture without a random yield range has no `range` until one is tuned in.
    for (const f of FIELDS) if (f.kind.type !== 'optionalRange') expect(getPath(DEFAULTS, f.path), f.path).not.toBeUndefined();
  });

  it('every shipped value fits its field exactly (so an untouched value never changes)', () => {
    for (const f of FIELDS) {
      const value = getPath(DEFAULTS, f.path);
      if (f.kind.type === 'optionalRange' && value === undefined) continue;
      const result = checkValue(f, value);
      expect(result.ok, `${f.path}: ${result.ok ? '' : result.reason}`).toBe(true);
      if (result.ok) expect(result.value, f.path).toEqual(value);
    }
  });

  it('every number, text and list in the config is tunable, unless deliberately left out', () => {
    const missing = leaves(DEFAULTS)
      .map(([path]) => path)
      .filter((path) => !FIELD_BY_PATH.has(path) && !NOT_TUNABLE.some((re) => re.test(path)));
    // A fixture without a random range has no `range` key, so it can't be missing here.
    expect(missing).toEqual([]);
  });

  it("a slider narrower than its field's limits stays inside them and holds the shipped value", () => {
    for (const f of FIELDS) {
      if (f.kind.type !== 'number' || !f.kind.slider) continue;
      const [lo, hi] = f.kind.slider;
      const shipped = getPath(DEFAULTS, f.path) as number;
      expect(lo >= f.kind.min && hi <= f.kind.max && lo < hi && shipped >= lo && shipped <= hi, f.path).toBe(true);
    }
  });

  it('paths are unique and fields have labels', () => {
    expect(FIELD_BY_PATH.size).toBe(FIELDS.length);
    for (const f of FIELDS) expect(f.label.trim(), f.path).not.toBe('');
  });

  it('clamps, rounds, and refuses nonsense', () => {
    const speed = FIELD_BY_PATH.get('npcs.mr_gravy.speed')!;
    expect(checkValue(speed, 99)).toMatchObject({ ok: true, value: 8 });
    expect(checkValue(speed, 1.3)).toMatchObject({ ok: true, value: 1.25 });
    expect(checkValue(speed, '2').ok).toBe(false);
    expect(checkValue(speed, Number.NaN).ok).toBe(false);
    const pause = FIELD_BY_PATH.get('balance.boss.waypointPause')!;
    expect(checkValue(pause, [3, 1])).toMatchObject({ ok: true, value: [1, 3] });
    const range = FIELD_BY_PATH.get('fixtures.desk.range')!;
    expect(checkValue(range, null)).toMatchObject({ ok: true, value: null });
    const hangouts = FIELD_BY_PATH.get('balance.students.hangouts')!;
    expect(checkValue(hangouts, ['hallway', 'moon', 'hallway'])).toMatchObject({ ok: true, value: ['hallway'] });
    expect(checkValue(hangouts, []).ok).toBe(false);
    const ability = FIELD_BY_PATH.get('characters.dunkin.ability')!;
    expect(checkValue(ability, null)).toMatchObject({ ok: true, value: null });
    expect(checkValue(ability, 'fly').ok).toBe(false);
    const lines = FIELD_BY_PATH.get('lines.students.chatter')!;
    expect(checkValue(lines, ['  hi  ', '', 'there\n'])).toMatchObject({ ok: true, value: ['hi', 'there'] });
  });

  it('formats values the way people read them', () => {
    expect(formatValue(FIELD_BY_PATH.get('balance.boss.chaseAt')!, 0.35)).toBe('35%');
    expect(formatValue(FIELD_BY_PATH.get('balance.sleepyCoworker.hushMoney')!, 50)).toBe('$50');
    expect(formatValue(FIELD_BY_PATH.get('fixtures.desk.range')!, null)).toBe('off');
    expect(formatValue(FIELD_BY_PATH.get('balance.boss.waypointPause')!, [0.8, 1.8])).toBe('0.8–1.8 s');
  });

  it('previews read the values being edited, not the live game', () => {
    const v = valuesWith({ characters: { dalton: { stats: { speed: 1 } } } });
    const field = FIELD_BY_PATH.get('characters.dalton.stats.speed')!;
    expect(field.preview!(v)).toContain('2');
    expect(field.preview!(DEFAULTS)).toContain('3.2');
    for (const f of FIELDS) if (f.preview) expect(() => f.preview!(DEFAULTS), f.path).not.toThrow();
  });

  it("says what the shift clock will show, also when the end hour isn't after the start", () => {
    const end = FIELD_BY_PATH.get('balance.shift.endHour')!;
    expect(end.preview!(DEFAULTS)).toBe('the clock runs 7:00 AM to 3:00 PM');
    expect(end.preview!(valuesWith({ balance: { shift: { startHour: 20, endHour: 24 } } }))).toBe('the clock runs 8:00 PM to 12:00 AM');
    expect(end.preview!(valuesWith({ balance: { shift: { startHour: 20, endHour: 8 } } }))).toBe('ends before it starts, so the clock runs 8:00 PM to 9:00 PM');
  });
});

describe('applying tuning', () => {
  it('changes the live config in place, then puts it back', () => {
    const students = BALANCE.students;
    const hangouts = BALANCE.students.hangouts;
    const desk = FIXTURES.desk;
    applyTuning({
      ...emptyTuning(),
      values: { balance: { students: { visionRangeTiles: 7, hangouts: ['hallway'] }, movement: { baseTilesPerSecond: 2 } }, fixtures: { desk: { range: null, scrap: 2 } } },
    });
    expect(BALANCE.students.visionRangeTiles).toBe(7);
    expect(BALANCE.students).toBe(students); // same object: code holding it sees the change
    expect(BALANCE.students.hangouts).toBe(hangouts);
    expect(hangouts).toEqual(['hallway']);
    expect(FIXTURES.desk).toBe(desk);
    expect(desk.range).toBeUndefined();
    expect(desk.scrap).toBe(2);
    expect(tilesPerSecond(0)).toBe(2);

    applyTuning(emptyTuning());
    expect(BALANCE.students.visionRangeTiles).toBe(DEFAULTS.balance.students.visionRangeTiles);
    expect(hangouts).toEqual(DEFAULTS.balance.students.hangouts);
    expect(desk.range).toEqual(DEFAULTS.fixtures.desk.range);
    expect(bagCapacity(1)).toBe(2);
  });

  it('ignores what the Studio cannot change, and clamps the rest', () => {
    const warnings = applyTuning({
      ...emptyTuning(),
      values: { balance: { boss: { sprintFactor: 50 }, secretCheat: 1 }, fixtures: { desk: { solid: false, id: 'x' } }, npcs: { mr_gravy: { speed: 'fast' } } },
    });
    expect(BALANCE.boss.sprintFactor).toBe(3);
    expect(FIXTURES.desk.solid).toBe(true);
    expect(FIXTURES.desk.id).toBe('desk');
    expect(warnings.join('\n')).toMatch(/secretCheat/);
    expect(warnings.join('\n')).toMatch(/fixtures\.desk\.solid/);
    expect(warnings.join('\n')).toMatch(/mr_gravy\.speed/);
  });

  it('lines change the lists the game picks from', () => {
    const list = STUDENT_LINES.chatter;
    applyTuning({ ...emptyTuning(), values: { lines: { students: { chatter: ['Hi!'] } } } });
    expect(STUDENT_LINES.chatter).toBe(list);
    expect(list).toEqual(['Hi!']);
  });

  it('remembers the tuned map and the file it applied', () => {
    const file = { ...emptyTuning(), revision: 4, map: 'BBB\nB.B\nBBB' };
    applyTuning(file);
    expect(tunedMapText()).toBe('BBB\nB.B\nBBB');
    expect(activeTuning().revision).toBe(4);
  });
});

describe('diffs and saves', () => {
  it('diffValues and valuesWith round-trip', () => {
    const overrides = { balance: { boss: { sprintFactor: 1.5 } }, materials: { copper: { pricePerUnit: 12 } }, fixtures: { lamp: { range: null } } };
    const values = valuesWith(overrides);
    expect(values.balance.boss.sprintFactor).toBe(1.5);
    expect(values.fixtures.lamp.range).toBeUndefined();
    expect(diffValues(values)).toEqual(overrides);
    expect(diffValues(DEFAULTS)).toEqual({});
    // The live game is untouched by valuesWith.
    expect(BALANCE.boss.sprintFactor).toBe(DEFAULTS.balance.boss.sprintFactor);
  });

  it('describes changes with section and group', () => {
    const to = valuesWith({ npcs: { mr_gravy: { speed: 1.5 } } });
    expect(describeChanges(DEFAULTS, to)).toEqual(['Mr. Gravy › Stats › Speed: 2 → 1.5']);
  });

  it('a save bumps the revision, keeps only changes against the code, and grows the history', () => {
    const builtInMap = 'BBB\nB.B\nBBB';
    let file = emptyTuning();
    const draft: Values = valuesWith({ balance: { shift: { lengthSeconds: 240 } } });
    file = makeSave({ values: draft, map: null, note: 'shorter shift', previous: file, now: '2026-10-12T10:00:00Z', builtInMap });
    expect(file.revision).toBe(1);
    expect(file.values).toEqual({ balance: { shift: { lengthSeconds: 240 } } });
    expect(file.history[0]).toMatchObject({
      revision: 1,
      note: 'shorter shift',
      changes: ['Shift & Rules › The shift › Shift length (real time): 300 s → 240 s'],
      values: { balance: { shift: { lengthSeconds: 240 } } },
      // The built-in map as it was, so the version comes back on it after the built-in one changes.
      map: builtInMap,
    });
    expect(file.map).toBeNull();
    file = makeSave({ values: draft, map: 'BBBB\nB..B\nBBBB', note: '', previous: file, now: '2026-10-12T11:00:00Z', builtInMap });
    expect(file.revision).toBe(2);
    expect(file.map).toBe('BBBB\nB..B\nBBBB');
    expect(file.history[0]).toMatchObject({ changes: ['Map › edited'], map: 'BBBB\nB..B\nBBBB' });
    // Saving the built-in map stores nothing (but the history entry still says which map it was).
    file = makeSave({ values: draft, map: builtInMap, note: '', previous: file, now: '2026-10-12T12:00:00Z', builtInMap });
    expect(file.map).toBeNull();
    expect(file.history[0]).toMatchObject({ changes: ['Map › back to the built-in school'], map: builtInMap });
    let many = file;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) many = makeSave({ values: draft, map: null, note: `${i}`, previous: many, now: '2026-10-12T12:00:00Z', builtInMap });
    expect(many.history).toHaveLength(HISTORY_LIMIT);
    expect(many.history[0].note).toBe(`${HISTORY_LIMIT + 4}`);
  });

  it('reading a tuning file never throws', () => {
    expect(parseTuning('not json').warnings[0]).toMatch(/not valid JSON/);
    expect(parseTuning('[]').file).toEqual(emptyTuning());
    expect(parseTuning('').file).toEqual(emptyTuning());
    const { file, warnings } = parseTuning(JSON.stringify({ format: 'copper-tuning', revision: 3.7, values: { balance: { boss: { chaseAt: 2 } } }, history: [{ note: 5 }, 'x'] }));
    expect(file.revision).toBe(3);
    expect(file.values).toEqual({ balance: { boss: { chaseAt: 1 } } });
    expect(file.history).toEqual([{ revision: 0, savedAt: '', note: '', changes: [], values: {}, map: null }]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('the repo tuning file reads back as itself', () => {
    const { file } = parseTuning(stringifyTuning(emptyTuning()));
    expect(file).toEqual(emptyTuning());
    const checked = checkOverrides({ balance: { students: { danger: { notice: 0.2 } } } });
    expect(checked.values).toEqual({ balance: { students: { danger: { notice: 0.2 } } } });
    expect(checked.warnings).toEqual([]);
  });
});
