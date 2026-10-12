// Browser storage for the Studio. It can be missing, full or blocked (private windows, sandboxed
// embeds, cleared site data), so every call is wrapped and the Studio works fine without it: the
// draft then simply doesn't survive a reload.

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(kind: 'localStorage' | 'sessionStorage'): KeyValue | null {
  try {
    return ((globalThis as Record<string, unknown>)[kind] as KeyValue | undefined) ?? null;
  } catch {
    // Reading the property itself throws when site data is blocked.
    return null;
  }
}

/** This browser's localStorage, or null. */
export const localStore = (): KeyValue | null => storage('localStorage');
/** This tab's sessionStorage (survives reloads, not closing the tab), or null. */
export const sessionStore = (): KeyValue | null => storage('sessionStorage');

export function readText(store: KeyValue | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** False when it couldn't be stored. */
export function writeText(store: KeyValue | null, key: string, value: string): boolean {
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(store: KeyValue | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to do: it stays, and is checked again when read.
  }
}

/** Stored JSON, or null when missing or unreadable. */
export function readJson(store: KeyValue | null, key: string): unknown {
  const text = readText(store, key);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(store: KeyValue | null, key: string, value: unknown): boolean {
  return writeText(store, key, JSON.stringify(value));
}
