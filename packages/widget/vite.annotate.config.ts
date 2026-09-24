import { defineConfig } from 'vite';

// Separate ES module, loaded by widget.js with import() only when the visitor opens the editor.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: { entry: 'src/annotate/index.ts', formats: ['es'], fileName: () => 'annotate.js' },
  },
});
