import { defineConfig } from 'vite';

// Separate ES module, loaded by widget.js with import() only when the panel opens.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    lib: { entry: 'src/screenshot.ts', formats: ['es'], fileName: () => 'screenshot.js' },
  },
});
