import { createChunkLoader } from './chunk-loader';

export type CaptureFn = (exclude: Element) => Promise<Blob | null>;

/** Loads the screenshot bundle on first use; any failure means "no screenshot", never an error. */
export function createScreenshotLoader(
  moduleUrl: string,
  importer?: (url: string) => Promise<unknown>,
): () => Promise<CaptureFn | null> {
  return createChunkLoader(
    moduleUrl,
    (mod) => {
      const capture = (mod as { capture?: unknown } | null)?.capture;
      return typeof capture === 'function' ? (capture as CaptureFn) : null;
    },
    importer,
  );
}
