import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const include = [
  'lib/**/*.test.ts',
  'app/**/*.test.ts',
  'i18n/**/*.test.ts',
  'messages/**/*.test.ts',
  'components/**/*.test.ts',
  'components/**/*.test.tsx',
];
const dbTests = ['**/*.db.test.ts', '**/*.db.test.tsx'];

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include,
          exclude: dbTests,
          testTimeout: 15_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: dbTests,
          setupFiles: ['./test/setup.ts'],
          // One database per file; sequential files keep the real-Supabase target free of lock contention.
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
