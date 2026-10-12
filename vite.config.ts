/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { copperTuning } from './tools/vite-copper.mjs';

// `npm run build`        -> dist/         normal multi-file build (GitHub Pages, itch.io, app wrappers)
// `npm run build:single` -> dist-single/  everything inlined into one index.html (easy sharing / embedding)

/** The single-file build has no manifest or icon files next to it, so drop the tags that point at them. */
const stripPwaLinks = (): Plugin => ({
  name: 'strip-pwa-links',
  transformIndexHtml: (html) => html.replace(/^\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n/gm, ''),
});

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    build: {
      outDir: single ? 'dist-single' : 'dist',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      chunkSizeWarningLimit: 2500,
      copyPublicDir: !single,
    },
    plugins: single ? [copperTuning(), stripPwaLinks(), viteSingleFile()] : [copperTuning()],
    // Builds and test output written next to the project shouldn't reload the dev server's page.
    server: { watch: { ignored: ['**/dist/**', '**/dist-single/**', '**/.smoke/**', '**/.tmp-*/**'] } },
    // Only the project's own tests (never scratch files in the gitignored .tmp-* folders).
    test: { include: ['src/**/*.test.ts'] },
  };
});
