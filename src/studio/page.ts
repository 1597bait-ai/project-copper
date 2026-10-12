// The game page as it is published on claude.ai (an Artifact), and how the page rebuilds itself
// when Copper Studio saves: the Studio swaps in a new tuning file and republishes the whole page,
// so everyone who opens the link gets the new balance, signed in or not.
//
// No imports, so tools/artifact-page.mjs (Node) can use the same functions as the game. Keep it
// that way: the tool and the page must build byte-for-byte the same structure.

/** The document skeleton the artifact host wraps around a published page (and expects a page to send back). */
export const ARTIFACT_HEAD =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' +
  ':root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'html{scroll-padding-top:env(safe-area-inset-top,0px)}' +
  'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}' +
  'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}' +
  '</style></head><body>';
export const ARTIFACT_TAIL = '</body></html>';

/** Element ids the page is built from. */
export const PAGE_IDS = { style: 'copper-style', tuning: 'copper-tuning', script: 'copper-game' } as const;

export interface PageParts {
  title: string;
  /** The page's CSS (without the <style> tag). */
  style: string;
  /** The tuning file (JSON text). */
  tuning: string;
  /** The whole game, as one ES module (without the <script> tag). */
  script: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * JSON that is safe inside a <script> element: "<" is written as the escape \u003c (still the same JSON),
 * so a "</script>" in a note or a map can never end the element early.
 */
export function embedJson(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** The page content, exactly as the Artifact tool publishes it (the host adds the skeleton). */
export function buildPageContent(parts: PageParts): string {
  if (/<\/script/i.test(parts.script)) throw new Error('The game script contains "</script" and cannot be inlined');
  if (/<\/style/i.test(parts.style)) throw new Error('The page style contains "</style" and cannot be inlined');
  return [
    `<title>${escapeHtml(parts.title)}</title>`,
    `<style id="${PAGE_IDS.style}">${parts.style}</style>`,
    `<script type="application/json" id="${PAGE_IDS.tuning}">${embedJson(parts.tuning)}</script>`,
    '<div id="game"></div>',
    `<script type="module" id="${PAGE_IDS.script}">${parts.script}</script>`,
    '',
  ].join('\n');
}

/** The complete document the page sends when it republishes itself. */
export function buildArtifactDocument(parts: PageParts): string {
  return `${ARTIFACT_HEAD}\n${buildPageContent(parts)}\n${ARTIFACT_TAIL}`;
}

/** Reads the parts back out of a page's HTML (a saved artifact, or the content file). Null if it isn't one. */
export function parsePage(html: string): PageParts | null {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const style = new RegExp(`<style id="${PAGE_IDS.style}">([\\s\\S]*?)</style>`).exec(html)?.[1];
  const tuning = new RegExp(`<script type="application/json" id="${PAGE_IDS.tuning}">([\\s\\S]*?)</script>`).exec(html)?.[1];
  const script = new RegExp(`<script type="module" id="${PAGE_IDS.script}">([\\s\\S]*)</script>`).exec(html)?.[1];
  if (title === undefined || style === undefined || tuning === undefined || script === undefined) return null;
  const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return { title: unescape(title), style, tuning, script };
}
