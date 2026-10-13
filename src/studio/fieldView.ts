// One setting in the Studio, drawn from its schema field (src/config/schema.ts): its label, help,
// input(s), live preview, and whether it differs from the saved and the shipped values.

import { checkValue, formatValue, type Field } from '../config/schema';
import { getPath, type Values } from '../config/tuning';
import { h } from './dom';
import {
  choiceIndex,
  dragSlider,
  inputScale,
  limitsText,
  linesToText,
  rangeStart,
  readLines,
  readNumber,
  readRange,
  readSet,
  readText,
  sliderRange,
  toInput,
  unitOf,
  type Reading,
} from './fields';

/** What a field view reads and writes. The Studio swaps the value objects on every change. */
export interface FieldHost {
  readonly draft: Values;
  readonly saved: Values;
  readonly shipped: Values;
  /** Puts a value (already checked) into the draft. */
  set(path: string, value: unknown, from: FieldView): void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
let ids = 0;

/** How far a finger moves sideways before a slider follows it (less is a tap, or a scroll starting). */
const DRAG_START_PX = 6;

/**
 * Touch screens: a native slider jumps to wherever a finger lands, so scrolling the page past one
 * would change its value. There the slider ignores touches (see styles.ts) and its track follows
 * sideways drags only; a swipe up or down scrolls the page as usual. A mouse uses the slider itself.
 */
function followSidewaysDrags(track: HTMLElement, slider: HTMLInputElement, onValue: (v: number) => void): void {
  let drag: { id: number; x: number; y: number; from: number; on: boolean } | null = null;
  track.addEventListener('pointerdown', (e) => {
    // On the slider itself: it takes pointers here, and handles them natively.
    if (e.target !== track || slider.disabled || !e.isPrimary) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: Number(slider.value), on: false };
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.on) {
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
      drag.on = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone: this move is the last one anyway.
      }
    }
    onValue(dragSlider(drag.from, dx, slider.getBoundingClientRect().width, Number(slider.min), Number(slider.max)));
  });
  const end = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) drag = null;
  };
  // pointercancel: the browser took the swipe for a scroll.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) track.addEventListener(type, end);
}

export class FieldView {
  readonly root: HTMLElement;
  private readonly control: HTMLElement;
  private readonly preview: HTMLElement | null;
  private readonly msg: HTMLElement;
  private readonly status: HTMLElement;
  /** Writes the draft's value into the inputs; inputs being typed in are left alone unless `force`. */
  private show: (value: unknown, force: boolean) => void = () => {};
  private shownStatus = '';

  constructor(
    readonly field: Field,
    private readonly host: FieldHost,
  ) {
    const id = `cs-f${++ids}`;
    const msgId = `${id}-msg`;
    this.msg = h('p', { class: 'cs-msg', id: msgId, 'aria-live': 'polite' });
    this.status = h('div', { class: 'cs-status' });
    this.preview = field.preview ? h('p', { class: 'cs-preview' }) : null;
    this.control = h('div', { class: 'cs-control' });
    const label = h('label', { class: 'cs-label', for: id }, field.label);
    this.root = h(
      'div',
      { class: 'cs-field', 'data-path': field.path },
      h('div', { class: 'cs-field-text' }, label, field.help ? h('p', { class: 'cs-help' }, field.help) : null),
      h('div', { class: 'cs-field-input' }, this.control, this.preview, this.msg, this.status),
    );
    this.build(id, msgId);
    this.update(true);
  }

  private get value(): unknown {
    return getPath(this.host.draft, this.field.path);
  }

  /**
   * Something changed in the draft: show its value, the preview and the markers. `force` also
   * rewrites the input being typed in and clears the field's note (the value came from elsewhere).
   */
  update(force = false): void {
    if (force) this.say(null);
    this.show(this.value, force);
    if (this.preview) {
      try {
        this.preview.textContent = this.field.preview!(this.host.draft);
      } catch {
        this.preview.textContent = '';
      }
    }
    this.renderStatus();
  }

  /** Says something under the field (a clamp note or an error), or clears it. */
  private say(reading: Reading<unknown> | null): void {
    const text = reading?.error ?? reading?.note ?? '';
    this.msg.textContent = text;
    this.msg.className = `cs-msg${reading?.error ? ' is-error' : reading?.note ? ' is-note' : ''}`;
  }

  private put(value: unknown): void {
    this.host.set(this.field.path, value, this);
  }

  private renderStatus(): void {
    const { field, host } = this;
    const now = this.value;
    const saved = getPath(host.saved, field.path);
    const shipped = getPath(host.shipped, field.path);
    const unsaved = !same(now, saved);
    const custom = !same(now, shipped);
    const key = `${unsaved}|${custom}|${JSON.stringify(saved ?? null)}|${JSON.stringify(shipped ?? null)}`;
    this.root.classList.toggle('is-unsaved', unsaved);
    if (key === this.shownStatus) return;
    this.shownStatus = key;
    const parts: HTMLElement[] = [];
    if (unsaved) {
      parts.push(
        h(
          'span',
          null,
          h('span', { class: 'cs-dot', 'aria-hidden': 'true' }),
          `Unsaved · was ${formatValue(field, saved ?? null)}`,
          h('button', { class: 'cs-link', type: 'button', title: 'Back to the saved value', onClick: () => this.restore(saved ?? null) }, 'Undo'),
        ),
      );
    }
    if (custom) {
      parts.push(
        h(
          'span',
          null,
          `Shipped: ${formatValue(field, shipped ?? null)}`,
          h('button', { class: 'cs-link', type: 'button', title: 'Back to the value the game ships with', onClick: () => this.restore(shipped ?? null) }, 'Reset'),
        ),
      );
    }
    this.status.replaceChildren(...parts);
  }

  private restore(value: unknown): void {
    this.put(value);
    this.update(true);
  }

  // ---- the inputs, by kind ---------------------------------------------------------------

  private build(id: string, msgId: string): void {
    const { field } = this;
    const k = field.kind;
    const typing = (el: HTMLElement) => document.activeElement === el;
    const textInput = (cls: string, extra: Record<string, string | number> = {}) =>
      h('input', { id, class: cls, type: 'text', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-describedby': msgId, ...extra });

    switch (k.type) {
      case 'number': {
        const scale = inputScale(field);
        const { before, after } = unitOf(field);
        const input = textInput('cs-num', { inputmode: 'decimal', title: limitsText(field) });
        const range = sliderRange(field);
        const slider = h('input', { class: 'cs-slider', type: 'range', min: range.min, max: range.max, step: range.step, tabindex: -1, 'aria-label': `${field.label} (slider)` });
        const track = h('span', { class: 'cs-track' }, slider);
        this.control.append(h('span', { class: 'cs-numbox' }, before ? h('span', { class: 'cs-unit' }, before) : null, input, after ? h('span', { class: 'cs-unit' }, after) : null), track);
        const step = Number(range.step) / scale;
        input.addEventListener('input', () => {
          const r = readNumber(field, input.value);
          this.say(r);
          if (r.value !== undefined) {
            this.put(r.value);
            slider.value = toInput(r.value, scale);
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const now = typeof this.value === 'number' ? (this.value as number) : k.min;
          const r = checkValue(field, now + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1));
          if (r.ok) {
            this.say(null);
            this.put(r.value);
            this.show(r.value, true);
          }
        });
        // Leaving the box shows the value actually used (the clamp note stays until the next edit).
        input.addEventListener('change', () => this.show(this.value, true));
        input.addEventListener('blur', () => this.show(this.value, true));
        // `raw` is in the slider's units (percent fields: 0–100).
        const fromSlider = (raw: number) => {
          const r = checkValue(field, raw / scale);
          if (!r.ok || typeof r.value !== 'number') return;
          this.say(null);
          this.put(r.value);
          input.value = toInput(r.value, scale);
          slider.value = toInput(r.value, scale);
        };
        slider.addEventListener('input', () => fromSlider(Number(slider.value)));
        followSidewaysDrags(track, slider, fromSlider);
        this.show = (value, force) => {
          if (typeof value !== 'number') return;
          if (force || !typing(input)) input.value = toInput(value, scale);
          slider.value = toInput(value, scale);
        };
        break;
      }

      case 'range':
      case 'optionalRange': {
        const unit = unitOf(field).after;
        const low = textInput('cs-num', { inputmode: 'decimal', title: limitsText(field), 'aria-label': `${field.label}: low` });
        const high = textInput('cs-num', { inputmode: 'decimal', title: limitsText(field), 'aria-label': `${field.label}: high` });
        high.removeAttribute('id');
        const pair = h('span', { class: 'cs-range' }, low, h('span', { class: 'cs-to' }, 'to'), high, unit ? h('span', { class: 'cs-unit' }, unit) : null);
        let toggle: HTMLInputElement | null = null;
        if (k.type === 'optionalRange') {
          toggle = h('input', { type: 'checkbox', role: 'switch', 'aria-label': `${field.label}: on or off` });
          const sw = toggle;
          this.control.append(h('label', { class: 'cs-switch' }, sw, h('span', null, 'Random')), pair);
          low.removeAttribute('id');
          sw.id = id;
          sw.addEventListener('change', () => {
            this.say(null);
            if (!sw.checked) this.put(null);
            else {
              const typed = readRange(field, low.value, high.value).value;
              this.put(typed ?? rangeStart(field, this.host.draft));
            }
            this.update(true);
          });
        } else this.control.append(pair);
        const onInput = () => {
          const r = readRange(field, low.value, high.value);
          this.say(r);
          if (r.value) this.put(r.value);
        };
        const commit = () => this.show(this.value, true);
        for (const box of [low, high]) {
          box.addEventListener('input', onInput);
          box.addEventListener('change', commit);
          box.addEventListener('blur', commit);
        }
        this.show = (value, force) => {
          const on = Array.isArray(value);
          if (toggle) {
            toggle.checked = on;
            low.disabled = high.disabled = !on;
          }
          // Switched off, the boxes keep showing the last range (greyed out), ready for switching back on.
          const pairValue = on ? (value as number[]) : low.value ? null : rangeStart(field, this.host.draft);
          if (!pairValue) return;
          if (force || !typing(low)) low.value = toInput(pairValue[0]);
          if (force || !typing(high)) high.value = toInput(pairValue[1]);
        };
        break;
      }

      case 'text': {
        const input = textInput('cs-text', { maxlength: k.maxLength, placeholder: k.placeholder ?? '' });
        this.control.append(input);
        input.addEventListener('input', () => {
          const r = readText(field, input.value);
          this.say(r);
          if (r.value !== undefined) this.put(r.value);
        });
        input.addEventListener('blur', () => this.show(this.value, true));
        this.show = (value, force) => {
          if (typeof value === 'string' && (force || !typing(input))) input.value = value;
        };
        break;
      }

      case 'lines': {
        const area = h('textarea', { id, class: 'cs-lines', rows: 4, spellcheck: 'true', 'aria-describedby': msgId });
        this.control.append(area);
        const fit = () => (area.rows = Math.min(12, Math.max(3, area.value.split('\n').length + 1)));
        area.addEventListener('input', () => {
          const r = readLines(field, area.value);
          this.say(r);
          if (r.value) this.put(r.value);
          fit();
        });
        area.addEventListener('blur', () => this.show(this.value, true));
        this.show = (value, force) => {
          if (!Array.isArray(value) || (!force && typing(area))) return;
          area.value = linesToText(value as string[]);
          fit();
        };
        break;
      }

      case 'choice': {
        const select = h('select', { id, class: 'cs-select', 'aria-describedby': msgId }, k.options.map((o, i) => h('option', { value: i }, o.label)));
        this.control.append(select);
        select.addEventListener('change', () => {
          const option = k.options[select.selectedIndex];
          if (option) this.put(option.value);
        });
        this.show = (value) => {
          select.selectedIndex = choiceIndex(field, value);
        };
        break;
      }

      case 'set': {
        const boxes = k.options.map((o) => {
          const box = h('input', { type: 'checkbox', value: String(o.value) });
          return { option: o, box, label: h('label', { class: 'cs-check' }, box, o.label) };
        });
        if (boxes[0]) boxes[0].box.id = id;
        this.control.append(h('div', { class: 'cs-set', role: 'group', 'aria-label': field.label }, boxes.map((b) => b.label)));
        for (const { box } of boxes) {
          box.addEventListener('change', () => {
            const picked = new Set(boxes.filter((b) => b.box.checked).map((b) => String(b.option.value)));
            const r = readSet(field, picked, getPath(this.host.saved, field.path), getPath(this.host.shipped, field.path), this.value);
            this.say(r);
            if (r.value) this.put(r.value);
            else box.checked = true;
          });
        }
        this.show = (value) => {
          const list = Array.isArray(value) ? value : [];
          for (const { option, box } of boxes) box.checked = list.includes(option.value);
        };
        break;
      }
    }
  }
}
