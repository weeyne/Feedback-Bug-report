import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@bugping/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEditor, type EditorEnv } from './annotate/editor';
import type { AnnotateFn } from './annotate/types';
import { DEMO_SELECTORS } from './demo-selectors';
import { mountWidget, type WidgetHandle } from './ui/mount';
import type { PanelDeps } from './ui/panel';

const config: WidgetConfig = {
  primaryColor: '#E0321F',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://bugping.app/?ref=pk_NovaShopDemo0001&utm_source=widget',
  locale: 'en',
};
const metadata: ClientMetadata = {
  url: 'https://shop.example.com/checkout',
  referrer: '',
  userAgent: 'UA',
  language: 'en',
  timezone: 'UTC',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1280, h: 720, dpr: 1 },
  consoleErrors: [],
};
const shot = new Blob(['shot'], { type: 'image/webp' });
const annotated = new Blob(['annotated'], { type: 'image/webp' });

// The real editor, with a fake image environment (happy-dom has no canvas / image decoding).
const editorEnv: EditorEnv = {
  decode: async () => ({ source: {} as CanvasImageSource, width: 1280, height: 720, close() {} }),
  exportImage: async () => annotated,
};
const annotate: AnnotateFn = (input) => openEditor(input, editorEnv);

const flush = () => new Promise((r) => setTimeout(r, 0));

let handle: WidgetHandle | undefined;
afterEach(() => {
  handle?.destroy();
  handle = undefined;
  document.querySelector(DEMO_SELECTORS.editorHost)?.remove();
});

/** Exactly one match in `root`, not inside a hidden screen. */
function one(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelectorAll<HTMLElement>(selector);
  expect(found, selector).toHaveLength(1);
  const el = found[0]!;
  expect(el.closest('[hidden]'), `${selector} is hidden`).toBeNull();
  return el;
}

describe('DEMO_SELECTORS', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(DEMO_SELECTORS)).toBe(true);
  });

  it('matches the real widget and editor markup at every step of the demo', async () => {
    const submit = vi.fn<(p: SubmitPayload, s: Blob | null) => Promise<{ ok: true }>>(async () => ({
      ok: true,
    }));
    const deps: PanelDeps = {
      projectKey: 'pk_NovaShopDemo0001',
      submit,
      loadCapture: async () => async () => shot,
      loadAnnotate: async () => annotate,
      collectMetadata: () => metadata,
      now: () => 0,
    };
    handle = mountWidget(document.body, config, {
      deps,
      languages: ['en-US'],
      compact: () => false,
    });

    const host = one(document, DEMO_SELECTORS.host);
    const root = host.shadowRoot!;
    expect(root).not.toBeNull();

    // 1. Launcher → home screen.
    one(root, DEMO_SELECTORS.launcher).click();
    // 2. "Report a bug" → the form; the auto-capture settles into the ready state.
    one(root, DEMO_SELECTORS.bugCard).click();
    await flush();
    one(root, DEMO_SELECTORS.shotReady);
    one(root, DEMO_SELECTORS.thumbReady);

    // 3. Edit → the real editor in its own shadow root.
    one(root, DEMO_SELECTORS.annotate).click();
    await flush();
    await flush();
    const editorHost = one(document, DEMO_SELECTORS.editorHost);
    const editor = editorHost.shadowRoot!;
    expect(editor).not.toBeNull();
    const rect = one(editor, DEMO_SELECTORS.editorRectTool);
    expect(rect.textContent).toBe('Rectangle');
    rect.click();
    expect(rect.getAttribute('aria-pressed')).toBe('true');
    const canvas = one(editor, DEMO_SELECTORS.editorCanvas);
    expect(canvas.tagName).toBe('CANVAS');

    // 4. Done → back to the form with the annotated thumbnail.
    one(editor, DEMO_SELECTORS.editorDone).click();
    await flush();
    await flush();
    expect(document.querySelector(DEMO_SELECTORS.editorHost)).toBeNull();
    one(root, DEMO_SELECTORS.shotReady);
    one(root, DEMO_SELECTORS.thumbReady);

    // 5. Type the message.
    const message = one(root, DEMO_SELECTORS.message) as HTMLTextAreaElement;
    expect(message.tagName).toBe('TEXTAREA');
    message.value = 'The pay button does nothing';
    message.dispatchEvent(new Event('input', { bubbles: true }));

    // 6. Send → the thanks screen.
    one(root, DEMO_SELECTORS.send).click();
    await flush();
    await flush();
    one(root, DEMO_SELECTORS.thanks);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0].message).toBe('The pay button does nothing');
    expect(submit.mock.calls[0]![1]).toBe(annotated);
  });
});
