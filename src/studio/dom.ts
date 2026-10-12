// Tiny DOM helpers: Copper Studio is plain DOM, no UI framework.

export type Child = Node | string | number | null | undefined | false;
type Attr = string | number | boolean | null | undefined | ((e: Event) => void);

/**
 * An element with attributes and children. `on…` attributes add listeners ("onClick" -> click),
 * `class` sets the class name, `true` adds an empty attribute and false/null/undefined skip it.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, Attr> | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'class') el.className = String(value);
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

/** True for elements people type into (game keys must leave those alone). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type);
}

/** Copies text with the clipboard API, else the old copy command on a selected textarea. */
export async function copyText(text: string, area?: HTMLTextAreaElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Blocked (sandboxed frames): try the old way.
  }
  if (!area) return false;
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}
