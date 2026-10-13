// What the Studio's inputs show, and how what people type becomes a value the schema accepts
// (src/config/schema.ts does the clamping and rounding; this says so in plain English). Pure, so
// it is unit tested (fields.test.ts).

import { SECTIONS, checkValue, type Field, type FieldGroup, type FieldKind, type Section } from '../config/schema';
import { getPath, type Values } from '../config/tuning';

type NumberKind = Extract<FieldKind, { type: 'number' }>;
type RangeKind = Extract<FieldKind, { type: 'range' | 'optionalRange' }>;
type TextKind = Extract<FieldKind, { type: 'text' }>;
type LinesKind = Extract<FieldKind, { type: 'lines' }>;
type ChoiceKind = Extract<FieldKind, { type: 'choice' | 'set' }>;

export interface Reading<T> {
  /** The value to use (clamped and rounded by the schema). */
  value?: T;
  /** Said under the field when the value isn't exactly what was typed. */
  note?: string;
  /** Said instead when nothing usable was typed (the draft keeps its value). */
  error?: string;
}

/** Each field's section and group. */
export const PLACE_BY_PATH = new Map<string, { section: Section; group: FieldGroup }>(
  SECTIONS.flatMap((section) => section.groups.flatMap((group) => group.fields.map((f) => [f.path, { section, group }] as const))),
);

// ---- numbers ---------------------------------------------------------------------------

/** Percent fields are typed and shown as 0–100. */
export function inputScale(field: Field): number {
  return field.kind.type === 'number' && field.kind.percent ? 100 : 1;
}

/** A number as an input shows it: no float noise ("0.35" is "35" in a percent field). */
export function toInput(n: number, scale = 1): string {
  const v = Number((n * scale).toFixed(6));
  return String(Object.is(v, -0) ? 0 : v);
}

/** The unit beside a number input: '%' for percent fields, '$' in front of money. */
export function unitOf(field: Field): { before: string; after: string } {
  const k = field.kind;
  if (k.type === 'number' && k.percent) return { before: '', after: '%' };
  const unit = 'unit' in k ? (k.unit ?? '') : '';
  return unit === '$' ? { before: '$', after: '' } : { before: '', after: unit };
}

/** A number with its unit, the way the inputs show it ("8", "35%", "$50", "2.5 tiles"). */
export function showNumber(field: Field, n: number): string {
  const { before, after } = unitOf(field);
  const text = toInput(n, inputScale(field));
  return after === '%' ? `${text}%` : `${before}${text}${after ? ` ${after}` : ''}`;
}

/** A typed number: "1.5", "1,5", " 35 % ", "$50", "3,600"; null when it isn't one. */
export function parseTyped(text: string): number | null {
  let t = text.trim().replace(/^\$\s*/, '').replace(/\s*%$/, '').replace(/\s+/g, '');
  // "3,600" is thousands; any other single comma is a decimal comma ("1,5").
  t = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const stepOf = (k: NumberKind | RangeKind) => ('int' in k && k.int ? Math.max(1, k.step) : k.step);

/** Says how a typed number was changed to fit the field (undefined when it wasn't). */
function fitNote(field: Field, k: NumberKind | RangeKind, typed: number, value: number): string | undefined {
  if (Math.abs(typed - value) < 1e-9) return undefined;
  if (typed > k.max) return `The most is ${showNumber(field, k.max)}, so it's ${showNumber(field, value)}.`;
  if (typed < k.min) return `The least is ${showNumber(field, k.min)}, so it's ${showNumber(field, value)}.`;
  return `It goes in steps of ${showNumber(field, stepOf(k))}, so it's ${showNumber(field, value)}.`;
}

/** What was typed into a number field. */
export function readNumber(field: Field, text: string): Reading<number> {
  const k = field.kind as NumberKind;
  const typed = parseTyped(text);
  if (typed === null) return { error: text.trim() ? `"${text.trim()}" isn't a number.` : 'Type a number.' };
  const raw = typed / inputScale(field);
  const r = checkValue(field, raw);
  if (!r.ok || typeof r.value !== 'number') return { error: 'Type a number.' };
  return { value: r.value, note: fitNote(field, k, raw, r.value) };
}

/** The slider's range (its own where the field has one), in the same units as the input. */
export function sliderRange(field: Field): { min: string; max: string; step: string } {
  const k = field.kind as NumberKind;
  const s = inputScale(field);
  const [min, max] = k.slider ?? [k.min, k.max];
  return { min: toInput(min, s), max: toInput(max, s), step: toInput(stepOf(k), s) };
}

/**
 * Where a slider goes after a sideways drag of `dx` pixels along a track `width` pixels wide: it
 * moves with the finger from where it was, and never jumps to where the finger landed.
 */
export function dragSlider(from: number, dx: number, width: number, min: number, max: number): number {
  if (!(width > 0) || !Number.isFinite(dx) || !Number.isFinite(from)) return from;
  return Math.min(max, Math.max(min, from + (dx / width) * (max - min)));
}

/** "0.5 to 8, in steps of 0.25" for tooltips. */
export function limitsText(field: Field): string {
  const k = field.kind;
  if (k.type !== 'number' && k.type !== 'range' && k.type !== 'optionalRange') return '';
  return `${showNumber(field, k.min)} to ${showNumber(field, k.max)}, in steps of ${showNumber(field, stepOf(k))}`;
}

/** What was typed into the two boxes of a range field. */
export function readRange(field: Field, low: string, high: string): Reading<[number, number]> {
  const k = field.kind as RangeKind;
  const a = parseTyped(low);
  const b = parseTyped(high);
  if (a === null || b === null) return { error: 'Type a number in both boxes.' };
  const r = checkValue(field, [a, b]);
  if (!r.ok || !Array.isArray(r.value)) return { error: 'Type a number in both boxes.' };
  const [lo, hi] = r.value as number[];
  const [x, y] = a > b ? [b, a] : [a, b];
  const notes: string[] = [];
  if (a > b) notes.push('The low end was higher, so they swapped.');
  const fit = fitNote(field, k, x, lo) ?? fitNote(field, k, y, hi);
  if (fit) notes.push(fit.replace(/, so it's .*$/, '.'));
  return { value: [lo, hi], note: notes.join(' ') || undefined };
}

/** Where a switched-on optional range starts: both ends at the group's number in the same unit (a fixture's fixed yield). */
export function rangeStart(field: Field, values: Values): [number, number] {
  const k = field.kind as RangeKind;
  const group = PLACE_BY_PATH.get(field.path)?.group;
  const twin = group?.fields.find((f) => f !== field && f.kind.type === 'number' && !f.kind.percent && f.kind.unit === k.unit);
  const n = twin ? getPath(values, twin.path) : undefined;
  const v = typeof n === 'number' ? Math.min(k.max, Math.max(k.min, n)) : k.min;
  return [v, v];
}

// ---- text --------------------------------------------------------------------------------

/** What was typed into a one-line text field. */
export function readText(field: Field, text: string): Reading<string> {
  const k = field.kind as TextKind;
  const r = checkValue(field, text);
  if (!r.ok || typeof r.value !== 'string') return { error: "Can't be empty." };
  const cut = text.replace(/[\r\n]+/g, ' ').length > k.maxLength;
  return { value: r.value, note: cut ? `Cut to ${k.maxLength} characters.` : undefined };
}

/** One line per row. */
export const linesToText = (lines: readonly string[]): string => lines.join('\n');

/** What was typed into a lines field (one line each; empty rows are dropped). */
export function readLines(field: Field, text: string): Reading<string[]> {
  const k = field.kind as LinesKind;
  const typed = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const r = checkValue(field, typed);
  if (!r.ok || !Array.isArray(r.value)) return { error: 'Write at least one line.' };
  const notes: string[] = [];
  if (typed.length > k.maxItems) notes.push(`Only the first ${k.maxItems} lines are used.`);
  if (typed.some((l) => l.length > k.maxLength)) notes.push(`Lines are cut at ${k.maxLength} characters.`);
  return { value: r.value as string[], note: notes.join(' ') || undefined };
}

// ---- choices -----------------------------------------------------------------------------

/** The option a value is, by position (-1 when it isn't one). Options can be null ("None"), so selects use positions. */
export function choiceIndex(field: Field, value: unknown): number {
  return (field.kind as ChoiceKind).options.findIndex((o) => o.value === (value ?? null));
}

/**
 * The options picked in a set field. They keep the order of `orders` (the saved value, then the
 * shipped one), so ticking a box off and on again isn't counted as a change.
 */
export function readSet(field: Field, picked: ReadonlySet<string>, ...orders: unknown[]): Reading<string[]> {
  const options = (field.kind as ChoiceKind).options;
  const rank = (v: string) => {
    for (const [i, order] of orders.entries()) {
      const at = Array.isArray(order) ? order.indexOf(v) : -1;
      if (at >= 0) return i * 1000 + at;
    }
    return orders.length * 1000 + options.findIndex((o) => o.value === v);
  };
  const list = options
    .map((o) => o.value)
    .filter((v): v is string => typeof v === 'string' && picked.has(v))
    .sort((a, b) => rank(a) - rank(b));
  const r = checkValue(field, list);
  if (!r.ok || !Array.isArray(r.value)) return { error: 'Pick at least one.' };
  return { value: r.value as string[] };
}

// ---- search -------------------------------------------------------------------------------

export interface FieldHit {
  section: Section;
  group: FieldGroup;
  field: Field;
}

/**
 * Fields matching every word of `query` in their label, help, group or section. `titleOf` gives a
 * group's current title (a renamed crew member is found by the new name).
 */
export function searchFields(query: string, titleOf: (g: FieldGroup) => string = (g) => g.title, sections: readonly Section[] = SECTIONS): FieldHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: FieldHit[] = [];
  for (const section of sections) {
    for (const group of section.groups) {
      const around = `${titleOf(group)} ${group.title} ${group.help ?? ''} ${section.title}`;
      for (const field of group.fields) {
        const hay = `${field.label} ${field.help ?? ''} ${around}`.toLowerCase();
        if (words.every((w) => hay.includes(w))) hits.push({ section, group, field });
      }
    }
  }
  return hits;
}
