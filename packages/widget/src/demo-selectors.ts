/**
 * Selectors the landing page demo director uses to drive the real widget and the real annotation
 * editor. `host` and `editorHost` are queried in the page document; every other widget entry in the
 * widget host's open shadow root, and the `editor*` entries in the editor host's shadow root.
 * Pinned against the real markup by demo-selectors.test.ts, so a markup change that would break
 * the live demo fails CI instead.
 */
export const DEMO_SELECTORS = Object.freeze({
  /** The widget's shadow host (document). */
  host: '[data-bugping]',
  /** The round launcher button. */
  launcher: '.bp-trigger',
  /** The "Report a bug" card on the home screen. */
  bugCard: '.bp-card[data-type="bug"]',
  /** The screenshot block once the capture (or the annotated image) is ready. */
  shotReady: '.bp-shot[data-state="ready"]',
  /** The ready thumbnail inside the screenshot block. */
  thumbReady: '.bp-shot .bp-thumb[data-state="ready"]',
  /** The screenshot block's "Edit" button that opens the annotation editor. */
  annotate: '.bp-shot-annotate',
  /** The annotation editor's shadow host (document). */
  editorHost: '[data-bugping-annotate]',
  /** The editor's rectangle tool button. */
  editorRectTool: '.bp-annotate-toolbar button[data-tool="rect"]',
  /** The editor's drawing canvas. */
  editorCanvas: '.bp-annotate-canvas',
  /** The editor's Done button. */
  editorDone: '.bp-annotate-done',
  /** The form's message textarea. */
  message: '.bp-message',
  /** The form's Send button. */
  send: '.bp-send',
  /** The "Thanks" screen, once shown (it is in the panel from the start, `hidden`). */
  thanks: '.bp-thanks:not([hidden])',
} as const);

export type DemoSelector = keyof typeof DEMO_SELECTORS;
