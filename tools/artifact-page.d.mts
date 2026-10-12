import type { PageParts } from '../src/studio/page';
import type { TuningFile, parseTuning, stringifyTuning } from '../src/config/tuning';

/** The single-file build's title, style and game script. Throws when one is missing or doubled, or the build has more than the page can carry. */
export function extractBuildParts(html: string): Omit<PageParts, 'tuning'>;

/** The page content the Artifact tool publishes: the single-file build's parts with `tuningText` as the balance. */
export function buildArtifactPage(singleHtml: string, tuningText: string): string;

export interface Pulled {
  file: TuningFile;
  warnings: string[];
  /** The new src/config/tuning.json (map moved out, history kept). */
  tuningText: string;
  /** The new src/assets/maps/lincoln.txt, or null to leave it alone. */
  mapText: string | null;
}

/**
 * What `pull` writes into the repo from a page saved on claude.ai (or an exported tuning file).
 * Throws for anything else, and when `repoTuning` (the repo's tuning file now) is newer, unless `force`.
 */
export function pullTuning(
  text: string,
  tuning: { parseTuning: typeof parseTuning; stringifyTuning: typeof stringifyTuning },
  options?: { repoTuning?: string; force?: boolean },
): Pulled;
