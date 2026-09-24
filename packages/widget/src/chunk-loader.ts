import type { AnnotateFn } from './annotate/types';

const nativeImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

/** Loads an ES module chunk on first use; any failure resolves null, never an error. */
export function createChunkLoader<T>(
  moduleUrl: string,
  pick: (mod: unknown) => T | null,
  importer: (url: string) => Promise<unknown> = nativeImport,
): () => Promise<T | null> {
  let pending: Promise<T | null> | undefined;
  return () =>
    (pending ??= importer(moduleUrl).then(
      (mod) => {
        try {
          return pick(mod);
        } catch {
          return null;
        }
      },
      () => null,
    ));
}

export function createAnnotateLoader(
  moduleUrl: string,
  importer?: (url: string) => Promise<unknown>,
): () => Promise<AnnotateFn | null> {
  return createChunkLoader(
    moduleUrl,
    (mod) => {
      const fn = (mod as { annotate?: unknown } | null)?.annotate;
      return typeof fn === 'function' ? (fn as AnnotateFn) : null;
    },
    importer,
  );
}
