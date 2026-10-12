import { describe, expect, it } from 'vitest';
import { FIELD_BY_PATH, FIELDS } from '../config/schema';
import { DEFAULTS, valuesWith } from '../config/tuning';
import {
  choiceIndex,
  inputScale,
  limitsText,
  linesToText,
  parseTyped,
  rangeStart,
  readLines,
  readNumber,
  readRange,
  readSet,
  readText,
  searchFields,
  showNumber,
  sliderRange,
  toInput,
  unitOf,
} from './fields';

const field = (path: string) => {
  const f = FIELD_BY_PATH.get(path);
  if (!f) throw new Error(path);
  return f;
};

describe('numbers', () => {
  it('reads what people type', () => {
    expect(parseTyped('1.5')).toBe(1.5);
    expect(parseTyped(' 1,5 ')).toBe(1.5);
    expect(parseTyped('35 %')).toBe(35);
    expect(parseTyped('$50')).toBe(50);
    expect(parseTyped('3,600')).toBe(3600);
    expect(parseTyped('.5')).toBe(0.5);
    expect(parseTyped('2.')).toBe(2);
    expect(parseTyped('')).toBeNull();
    expect(parseTyped('fast')).toBeNull();
    expect(parseTyped('1.2.3')).toBeNull();
  });

  it('shows numbers without float noise', () => {
    expect(toInput(0.1 + 0.2)).toBe('0.3');
    expect(toInput(0.35, 100)).toBe('35');
    expect(toInput(-0)).toBe('0');
  });

  it('shows and reads percent fields as 0–100', () => {
    const chase = field('balance.boss.chaseAt');
    expect(inputScale(chase)).toBe(100);
    expect(unitOf(chase)).toEqual({ before: '', after: '%' });
    expect(readNumber(chase, '50')).toEqual({ value: 0.5, note: undefined });
    expect(readNumber(chase, '50%').value).toBe(0.5);
    expect(sliderRange(chase)).toEqual({ min: '0', max: '100', step: '5' });
    expect(showNumber(chase, 0.35)).toBe('35%');
  });

  it('clamps and rounds, and says so in the units people typed', () => {
    const speed = field('npcs.mr_gravy.speed');
    expect(readNumber(speed, '99')).toEqual({ value: 8, note: "The most is 8, so it's 8." });
    expect(readNumber(speed, '0')).toEqual({ value: 0.5, note: "The least is 0.5, so it's 0.5." });
    expect(readNumber(speed, '1.3')).toEqual({ value: 1.25, note: "It goes in steps of 0.25, so it's 1.25." });
    expect(readNumber(field('balance.boss.chaseAt'), '120').note).toBe("The most is 100%, so it's 100%.");
    expect(readNumber(field('balance.sleepyCoworker.hushMoney'), '2000').note).toBe("The most is $1000, so it's $1000.");
    expect(readNumber(field('balance.boss.catchRangeTiles'), '9').note).toBe("The most is 3 tiles, so it's 3 tiles.");
  });

  it('refuses what is not a number', () => {
    const speed = field('npcs.mr_gravy.speed');
    expect(readNumber(speed, 'fast')).toEqual({ error: '"fast" isn\'t a number.' });
    expect(readNumber(speed, '  ')).toEqual({ error: 'Type a number.' });
  });

  it('whole-number fields step by whole numbers', () => {
    const warnings = field('balance.warningsUntilFired');
    expect(sliderRange(warnings).step).toBe('1');
    expect(readNumber(warnings, '2.4').value).toBe(2);
    expect(limitsText(warnings)).toBe('1 to 10, in steps of 1');
  });
});

describe('ranges', () => {
  it('reads two numbers, swapping them when needed', () => {
    const pause = field('balance.boss.waypointPause');
    expect(readRange(pause, '0.8', '1.8')).toEqual({ value: [0.8, 1.8], note: undefined });
    expect(readRange(pause, '3', '1')).toEqual({ value: [1, 3], note: 'The low end was higher, so they swapped.' });
    expect(readRange(pause, '1', '99')).toEqual({ value: [1, 20], note: 'The most is 20 s.' });
    expect(readRange(pause, '1', '')).toEqual({ error: 'Type a number in both boxes.' });
  });

  it('starts a switched-on yield range at the fixed yield', () => {
    const range = field('fixtures.desk.range');
    expect(rangeStart(range, valuesWith({ fixtures: { desk: { scrap: 1.5 } } }))).toEqual([1.5, 1.5]);
    expect(rangeStart(range, DEFAULTS)).toEqual([DEFAULTS.fixtures.desk.scrap, DEFAULTS.fixtures.desk.scrap]);
  });
});

describe('text and lines', () => {
  it('refuses empty text and says when it was cut', () => {
    const name = field('characters.dalton.name');
    expect(readText(name, 'Dal')).toEqual({ value: 'Dal', note: undefined });
    expect(readText(name, '  ')).toEqual({ error: "Can't be empty." });
    expect(readText(name, 'x'.repeat(30))).toEqual({ value: 'x'.repeat(20), note: 'Cut to 20 characters.' });
  });

  it('reads one line per row, dropping empty rows', () => {
    const chatter = field('lines.students.chatter');
    expect(readLines(chatter, ' Hi! \n\n  Stay sharp!\n')).toEqual({ value: ['Hi!', 'Stay sharp!'], note: undefined });
    expect(readLines(chatter, '\n \n')).toEqual({ error: 'Write at least one line.' });
    expect(readLines(chatter, Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n')).note).toBe('Only the first 20 lines are used.');
    expect(linesToText(['a', 'b'])).toBe('a\nb');
  });
});

describe('choices and sets', () => {
  it('finds options by position, "None" included', () => {
    const ability = field('characters.dunkin.ability');
    expect(choiceIndex(ability, null)).toBe(0);
    expect(choiceIndex(ability, 'look_busy')).toBeGreaterThan(0);
    expect(choiceIndex(ability, 'fly')).toBe(-1);
  });

  it('keeps the saved order, so ticking a box off and on again is no change', () => {
    const hangouts = field('balance.students.hangouts');
    const shipped = DEFAULTS.balance.students.hangouts;
    expect(readSet(hangouts, new Set(shipped), shipped).value).toEqual(shipped);
    expect(readSet(hangouts, new Set(['lounge', 'hallway']), shipped).value).toEqual(['hallway', 'lounge']);
    // New picks go after the known ones, in option order.
    expect(readSet(hangouts, new Set(['outside', 'hallway']), ['hallway']).value).toEqual(['hallway', 'outside']);
    expect(readSet(hangouts, new Set())).toEqual({ error: 'Pick at least one.' });
  });
});

describe('search', () => {
  it('matches every word in the label, help, group or section', () => {
    const paths = searchFields('gravy speed').map((h) => h.field.path);
    expect(paths).toContain('npcs.mr_gravy.speed');
    expect(paths).not.toContain('npcs.student.speed');
    expect(searchFields('SPRINT').map((h) => h.field.path)).toContain('balance.boss.sprintFactor');
    expect(searchFields('cone').length).toBeGreaterThan(2);
    expect(searchFields('zzz nothing')).toEqual([]);
    expect(searchFields('  ')).toEqual([]);
  });

  it('finds a renamed crew member by the new name', () => {
    const hits = searchFields('dave speed', (g) => (g.id === 'crew.dalton' ? 'Dave' : g.title));
    expect(hits.map((h) => h.field.path)).toEqual(['characters.dalton.stats.speed']);
  });

  it('can say every number field’s limits', () => {
    for (const f of FIELDS) if (f.kind.type === 'number') expect(limitsText(f), f.path).toMatch(/ to .*steps of/);
  });
});
