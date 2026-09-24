import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: [
      'lib/**/*.test.ts',
      'app/**/*.test.ts',
      'i18n/**/*.test.ts',
      'messages/**/*.test.ts',
      'components/**/*.test.ts',
      'components/**/*.test.tsx',
    ],
    setupFiles: ['./test/setup.ts'],
    // One database per file; sequential files keep the real-Supabase target free of lock contention.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
