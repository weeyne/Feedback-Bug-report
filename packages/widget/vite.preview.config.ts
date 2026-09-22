import { defineConfig } from 'vite';

// ES module for the dashboard settings preview (/w/preview.js). Not size-limited: dashboard only.
export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify('preview') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    lib: { entry: 'src/preview.ts', formats: ['es'], fileName: () => 'preview.js' },
  },
});
