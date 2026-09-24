import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Runs after the screenshot and annotate builds: this hash busts caches of both chunks on every change.
const chunkHash = createHash('sha256')
  .update(readFileSync(new URL('./dist/screenshot.js', import.meta.url)))
  .update(readFileSync(new URL('./dist/annotate.js', import.meta.url)))
  .digest('hex')
  .slice(0, 8);

export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify(`${pkg.version}-${chunkHash}`) },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: {
      entry: 'src/entry.ts',
      name: 'BugpingWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    modulePreload: false,
    // rolldown-vite 8.x defaults lib builds to codeSplitting: false, which supersedes
    // rollupOptions.output.inlineDynamicImports (kept out to avoid its "ignored" warning).
  },
});
