// Where "Save to game" would go, asked once per page and remembered, so screens built later (the
// menu after a shift) know straight away whether to offer the Studio.

import { detectSaveEnv, type SaveEnv } from './save';

let known: SaveEnv | null = null;
let asking: Promise<SaveEnv> | null = null;

/** Where saves go, once found out (null while still asking). */
export function knownSaveEnv(): SaveEnv | null {
  return known;
}

/** Finds out where saves go. Never rejects: a failed check means "can't save here". */
export function saveEnv(): Promise<SaveEnv> {
  asking ??= detectSaveEnv().then(
    (env) => (known = env),
    (e: unknown) => (known = { target: 'none', canSave: false, reason: `Couldn't check where to save (${e instanceof Error ? e.message : String(e)}).` }),
  );
  return asking;
}
