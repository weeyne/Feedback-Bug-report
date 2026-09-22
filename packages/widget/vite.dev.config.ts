import { defineConfig } from 'vite';
import { mockApi } from './dev/mock-api';

// Source mode: /dev/index.html. Built mode (E2E): /dev/built.html loads dist/ via publicDir.
export default defineConfig({
  plugins: [mockApi()],
  publicDir: 'dist',
  define: { __WIDGET_VERSION__: JSON.stringify('dev') },
  server: { port: 5173, strictPort: true },
});
