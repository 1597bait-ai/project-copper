import type { Plugin } from 'vite';
/** Puts src/config/tuning.json into the page and (dev server) lets Copper Studio save into the repo. */
export function copperTuning(): Plugin;
/** The <script type="application/json" id="copper-tuning"> tag for the current tuning file. */
export function tuningTag(): string;
