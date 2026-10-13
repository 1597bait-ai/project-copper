import type { Plugin } from 'vite';
import type { parseTuning, stringifyTuning } from '../src/config/tuning';
import type { parseMap } from '../src/world/mapText';
import type { validateMap } from '../src/world/validate';

/** Puts src/config/tuning.json into the page and (dev server) lets Copper Studio save into the repo. */
export function copperTuning(options?: { tuningFile?: string; mapFile?: string }): Plugin;

/** The <script type="application/json" id="copper-tuning"> tag for a tuning file (the repo's by default). Throws if it isn't JSON. */
export function tuningTag(file?: string): string;

/** The parts of Node's request the save endpoint reads. */
export interface EndpointRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (chunk?: any) => void): unknown;
  resume?(): unknown;
  /** Where the request came from: one without an Origin header is only taken from this machine. */
  socket?: { remoteAddress?: string };
}

/** The parts of Node's response the save endpoint writes. */
export interface EndpointResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

export interface TuningEndpointOptions {
  tuningFile: string;
  mapFile: string;
  /** src/config/tuning.ts (the dev server loads it through Vite, so it is always the current code). */
  loadTuning: () => Promise<{ parseTuning: typeof parseTuning; stringifyTuning: typeof stringifyTuning }>;
  /** src/world/mapText.ts and validate.ts: a map the game can't play is refused. */
  loadMapRules: () => Promise<{ parseMap: typeof parseMap; validateMap: typeof validateMap }>;
  /** Biggest request body taken, in bytes. */
  maxBody?: number;
}

/**
 * The dev server's /__copper/tuning endpoint: GET { tuning, map }; POST { tuning } checks and writes
 * the repo files (400/413/415 for a bad request or an unplayable map, 403 for another site or a tool
 * on another machine, 409 for a save made from an older version than the repo's).
 */
export function tuningEndpoint(options: TuningEndpointOptions): (req: EndpointRequest, res: EndpointResponse) => void;
