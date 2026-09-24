// ES module served as /w/preview.js and imported at runtime by the web app:
// - the dashboard settings live preview (`mountWidget` with `preview: true`);
// - the landing page demo store (/demo/shop), which mounts the real widget with its own `deps`
//   built from the real screenshot/annotate chunk loaders, metadata collector and console buffer
//   (its `submit` never touches the network).
// widget.js, screenshot.js and annotate.js do not depend on this file.
export { mountWidget } from './ui/mount';
export type { MountOptions, PanelDeps, WidgetHandle } from './ui/mount';
export { createScreenshotLoader } from './screenshot-loader';
export type { CaptureFn } from './screenshot-loader';
export { createAnnotateLoader } from './chunk-loader';
export type { AnnotateFn } from './annotate/types';
export { collectMetadata } from './context/metadata';
export type { IdentifiedUser } from './context/metadata';
export { installConsoleBuffer } from './context/console-buffer';
export type { ConsoleBuffer } from './context/console-buffer';
export type { SubmitResult } from './api';
