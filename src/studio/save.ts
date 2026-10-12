// Where Copper Studio's "Save to game" goes, and how.
//
// - On claude.ai (the game published as an Artifact): the page republishes itself with the new
//   tuning file inside it (see page.ts). Everyone who opens the link gets the new balance, and
//   every open copy reloads to it. Needs the artifact's `artifact` capability and a viewer who
//   may publish (the owner, or an editor).
// - On the dev server (npm run dev): writes src/config/tuning.json (and the map file) in the repo.
// - Anywhere else (GitHub Pages, a downloaded copy): saving isn't possible; export the tuning file.
//
// CONTRACT STUB: the API below is final; the implementation is filled in by the save/publish work.

import type { TuningFile } from '../config/tuning';

export type SaveTarget = 'artifact' | 'dev' | 'none';

export interface SaveEnv {
  target: SaveTarget;
  /** Whether this viewer may save here (artifact: may publish a new version; dev: endpoint answers). */
  canSave: boolean;
  /** Why saving isn't possible, in plain English (when canSave is false). */
  reason?: string;
}

export type SaveErrorCode = 'conflict' | 'not_writer' | 'too_large' | 'rate_limited' | 'unsupported_page' | 'unavailable' | 'failed';

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Works out where a save would go, once per page load (memoized). Resolves within ~10 s. */
export function detectSaveEnv(): Promise<SaveEnv> {
  return Promise.resolve({ target: 'none', canSave: false, reason: 'Saving is not built yet.' });
}

/**
 * Saves a tuning file (its `map` included). Artifact: republishes the page and resolves
 * `{ reloads: true }` (this view reloads to the new version shortly after: stash anything that must
 * survive in sessionStorage BEFORE calling). Dev: writes the repo files and resolves
 * `{ reloads: true }` too (the dev server reloads the page). Rejects with {@link SaveError}.
 */
export async function saveTuning(_file: TuningFile, _env: SaveEnv): Promise<{ reloads: boolean }> {
  throw new SaveError('unavailable', 'Saving is not built yet.');
}

/**
 * Hands the tuning file to the developer to keep or send: a file download where the page may offer
 * one, else the clipboard, else `'shown'` (the caller shows the text for copying by hand).
 */
export async function exportTuning(_file: TuningFile): Promise<'downloaded' | 'copied' | 'shown'> {
  return 'shown';
}
