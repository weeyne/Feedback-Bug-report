import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/setup.ts'],
    // One database per file; sequential files keep the real-Supabase target free of lock contention.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000, // PGlite boot + migrations
  },
});
