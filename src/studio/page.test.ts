import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_HEAD,
  ARTIFACT_TAIL,
  PAGE_CAPABILITIES,
  buildArtifactDocument,
  buildPageContent,
  embedJson,
  inlineScriptProblem,
  parsePage,
  readLivePage,
  wrapInHost,
  type PageParts,
} from './page';

const parts: PageParts = {
  title: 'Project Copper',
  style: 'html,body{margin:0}',
  tuning: JSON.stringify({ format: 'copper-tuning', note: 'nasty </script><b>note</b>' }, null, 2),
  script: 'console.log(`a < b && c > d`);',
};

describe('the game page', () => {
  it('round-trips through the page format', () => {
    const content = buildPageContent(parts);
    expect(parsePage(content)).toEqual({ ...parts, tuning: embedJson(parts.tuning) });
    expect(JSON.parse(parsePage(content)!.tuning)).toEqual(JSON.parse(parts.tuning));
  });

  it('never lets the tuning end its <script> early', () => {
    const content = buildPageContent(parts);
    expect(content.match(/<\/script>/g)).toHaveLength(2);
    expect(embedJson('" "')).toBe('"\\u2028"');
  });

  it('wraps itself in the host skeleton, exactly like a published page', () => {
    const doc = buildArtifactDocument(parts);
    expect(doc.startsWith('<!doctype html><html><head><meta charset=utf8>')).toBe(true);
    expect(doc.startsWith(`${ARTIFACT_HEAD}\n<title>`)).toBe(true);
    expect(doc.endsWith(`</script>\n\n${ARTIFACT_TAIL}`)).toBe(true);
    expect(parsePage(doc)?.script).toBe(parts.script);
  });

  it('refuses a script that would close its own tag', () => {
    expect(() => buildPageContent({ ...parts, script: 'x="</script>"' })).toThrow();
    expect(() => buildPageContent({ ...parts, script: 'x="</SCRIPT "' })).toThrow();
  });

  it('refuses a script whose end tag the browser would never see', () => {
    // "<!--" then "<script" (no "-->" between): the parser reads past the real </script>.
    expect(inlineScriptProblem('a="<!--";b="<script>";')).toMatch(/<!--/);
    expect(inlineScriptProblem('a="<!--";b="<script type=module>";')).not.toBeNull();
    expect(() => buildPageContent({ ...parts, script: 'a="<!--";b="<script>";' })).toThrow(/cannot be inlined/);
    // Harmless: the comment is closed first, "<script" comes first, or it isn't a tag name.
    expect(inlineScriptProblem('a="<!-- -->";b="<script>";')).toBeNull();
    expect(inlineScriptProblem('b="<script>";a="<!--";')).toBeNull();
    expect(inlineScriptProblem('a="<!--";b="<scripts>";')).toBeNull();
  });

  it('is not fooled by a page without the parts', () => {
    expect(parsePage('<html><body>hello</body></html>')).toBeNull();
  });

  it('reads the game script alone when the host adds scripts after it', () => {
    const doc = wrapInHost(`${buildPageContent(parts)}<script src="/runtime.js"></script><script>window.host = 1;</script>`);
    expect(parsePage(doc)?.script).toBe(parts.script);
  });

  it('is published with saving and downloads switched on', () => {
    expect(PAGE_CAPABILITIES).toEqual({ artifact: {}, downloads: true });
  });
});

describe('the live page', () => {
  // What a browser's DOM holds once it has loaded the published page.
  const live = parsePage(buildArtifactDocument(parts))!;
  const head = { nodeName: 'HEAD' };
  const body = { nodeName: 'BODY' };
  const element = (tagName: string, textContent: string, parentNode: object = body) => ({ tagName, textContent, parentNode });
  type FakeElement = ReturnType<typeof element>;
  /** Just the DOM calls readLivePage makes. */
  const fakeDocument = (byId: Record<string, FakeElement>, titles: FakeElement[]) =>
    ({ getElementById: (id: string) => byId[id] ?? null, getElementsByTagName: (tag: string) => (tag === 'title' ? titles : []) }) as unknown as Document;
  const page = (extra: Record<string, FakeElement> = {}) => ({
    'copper-style': element('STYLE', live.style),
    'copper-tuning': element('SCRIPT', live.tuning),
    'copper-game': element('SCRIPT', live.script),
    ...extra,
  });

  it('rebuilds exactly the page it came from, whatever title the host adds', () => {
    const read = readLivePage(fakeDocument(page(), [element('TITLE', 'Claude', head), element('TITLE', live.title)]));
    expect(read).toEqual(live);
    expect(buildArtifactDocument(read!)).toBe(buildArtifactDocument(parts));
    expect(buildArtifactDocument(parts)).toBe(wrapInHost(buildPageContent(parts)));
  });

  it('is null for a page published before Copper Studio could save into it', () => {
    expect(readLivePage(fakeDocument({ 'copper-style': element('STYLE', live.style) }, []))).toBeNull();
    expect(readLivePage(fakeDocument(page({ 'copper-game': element('DIV', '') }), []))).toBeNull();
    expect(readLivePage(fakeDocument(page({ 'copper-style': element('LINK', '') }), []))).toBeNull();
  });
});
