export type CaptureFn = (exclude: Element) => Promise<Blob | null>;

const nativeImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

/** Loads the screenshot bundle on first use; any failure means "no screenshot", never an error. */
export function createScreenshotLoader(
  moduleUrl: string,
  importer: (url: string) => Promise<unknown> = nativeImport,
): () => Promise<CaptureFn | null> {
  let pending: Promise<CaptureFn | null> | undefined;
  return () =>
    (pending ??= importer(moduleUrl).then(
      (mod) => {
        const capture = (mod as { capture?: unknown } | null)?.capture;
        return typeof capture === 'function' ? (capture as CaptureFn) : null;
      },
      () => null,
    ));
}
