import { describe, expect, it } from 'vitest';
import { ARTIFACT_HEAD, ARTIFACT_TAIL, buildArtifactDocument, buildPageContent, embedJson, parsePage, type PageParts } from './page';

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
  });

  it('is not fooled by a page without the parts', () => {
    expect(parsePage('<html><body>hello</body></html>')).toBeNull();
  });
});
