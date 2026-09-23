import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Runs after the screenshot build: its hash busts caches of screenshot.js on every change.
const screenshotHash = createHash('sha256')
  .update(readFileSync(new URL('./dist/screenshot.js', import.meta.url)))
  .digest('hex')
  .slice(0, 8);

export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify(`${pkg.version}-${screenshotHash}`) },
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
