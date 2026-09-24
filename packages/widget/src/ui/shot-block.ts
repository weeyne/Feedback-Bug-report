import type { AnnotateFn, Stroke } from '../annotate/types';
import { prepareImage, ImageError, type ImageErrorCode } from '../image/prepare';
import type { Messages } from '../i18n';
import type { CaptureFn } from '../screenshot-loader';
import { h } from './h';

export type ShotState = 'empty' | 'capturing' | 'ready' | 'failed';

export interface ShotBlockDeps {
  loadCapture(): Promise<CaptureFn | null>;
  loadAnnotate(): Promise<AnnotateFn | null>;
  /** Defaults to `prepareImage`. */
  prepare?(blob: Blob): Promise<Blob>;
}

export interface ShotBlock {
  element: HTMLElement;
  state(): ShotState;
  /** Called whenever the form opens for a type: clears everything; auto-captures when `auto`. */
  reset(auto: boolean): void;
  capture(): void;
  addImage(blob: Blob): Promise<void>;
  /** Paste/drop helpers: return true when they consumed an image. */
  handlePaste(event: ClipboardEvent): boolean;
  handleDrop(event: DragEvent): boolean;
  /** The image to send (annotated > original), waiting for a pending capture up to `waitMs`. */
  result(waitMs: number): Promise<Blob | null>;
  destroy(): void;
}

/** Resolves true if `promise` settles within `ms`, false otherwise. Never rejects. */
export function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const done = promise.then(
    () => true,
    () => true,
  );
  return Promise.race([done, cap]).finally(() => clearTimeout(timer));
}

function errorMessage(t: Messages, error: unknown): string {
  if (error instanceof ImageError) {
    const byCode: Record<ImageErrorCode, string> = {
      not_image: t.shot.notImage,
      too_large: t.shot.tooLarge,
      decode: t.shot.decode,
    };
    return byCode[error.code];
  }
  return t.shot.decode;
}

export function createShotBlock(options: {
  t: Messages;
  /** null = dashboard preview: static placeholder, actions disabled. */
  deps: ShotBlockDeps | null;
  /** Excluded from captures. */
  host: Element;
}): ShotBlock {
  const { t, deps, host } = options;
  const preview = deps === null;

  let state: ShotState = 'empty';
  let original: Blob | null = null;
  let annotated: Blob | null = null;
  let strokes: Stroke[] = [];
  let thumbUrl: string | null = null;
  let generation = 0;
  let capturePromise: Promise<void> | null = null;

  const liveRegion = h('span', { class: 'bp-shot-live', role: 'status', 'aria-live': 'polite' });
  liveRegion.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;';
  const errorEl = h('p', { class: 'bp-shot-error' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'bp-shot-input',
    hidden: true,
    onchange: () => {
      const file = fileInput.files?.[0] ?? null;
      fileInput.value = '';
      if (file) void addImage(file);
    },
  });

  const element = h('div', { class: 'bp-shot', 'data-state': state });

  function announce(text: string) {
    liveRegion.textContent = text;
  }

  function clearError() {
    errorEl.textContent = '';
  }

  function showError(text: string) {
    errorEl.textContent = text;
    announce(text);
  }

  function revokeThumb() {
    if (!thumbUrl) return;
    try {
      URL.revokeObjectURL(thumbUrl);
    } catch {
      // best-effort cleanup only
    }
    thumbUrl = null;
  }

  function clearImage() {
    revokeThumb();
    original = null;
    annotated = null;
    strokes = [];
  }

  function nextGeneration(): number {
    generation += 1;
    return generation;
  }

  function focusThumb() {
    const thumb = element.querySelector<HTMLElement>('.bp-thumb');
    thumb?.focus();
  }

  function buildEmpty(): Node[] {
    return [
      h(
        'div',
        { class: 'bp-shot-actions' },
        h(
          'button',
          { type: 'button', class: 'bp-shot-capture', onclick: () => capture() },
          `📸 ${t.shot.capture}`,
        ),
        h(
          'button',
          { type: 'button', class: 'bp-shot-file', onclick: () => fileInput.click() },
          `📎 ${t.shot.file}`,
        ),
      ),
      h('p', { class: 'bp-shot-hint' }, t.shot.pasteHint),
    ];
  }

  function buildCapturing(): Node[] {
    return [
      h(
        'span',
        { class: 'bp-thumb', 'data-state': 'loading' },
        h('span', { class: 'bp-thumb-shimmer' }),
      ),
    ];
  }

  function buildReady(): Node[] {
    const image = annotated ?? original;
    revokeThumb();
    let img: HTMLImageElement | null = null;
    if (image) {
      try {
        thumbUrl = URL.createObjectURL(image);
        img = h('img', { src: thumbUrl, alt: '' });
      } catch {
        // no inline preview available
      }
    }
    return [
      h(
        'button',
        {
          type: 'button',
          class: 'bp-thumb',
          'data-state': 'ready',
          'aria-label': t.shot.annotate,
          disabled: preview,
          onclick: () => void openAnnotate(),
        },
        img,
      ),
      h(
        'div',
        { class: 'bp-shot-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'bp-shot-annotate',
            disabled: preview,
            onclick: () => void openAnnotate(),
          },
          `✏️ ${t.shot.annotate}`,
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'bp-shot-replace',
            disabled: preview,
            onclick: () => fileInput.click(),
          },
          `📎 ${t.shot.replace}`,
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'bp-shot-remove',
            disabled: preview,
            onclick: () => remove(),
          },
          `🗑 ${t.shot.remove}`,
        ),
      ),
    ];
  }

  function buildFailed(): Node[] {
    return [
      h('span', { class: 'bp-thumb', 'data-state': 'unavailable' }, t.shot.captureFailed),
      h(
        'div',
        { class: 'bp-shot-actions' },
        h(
          'button',
          { type: 'button', class: 'bp-shot-file', onclick: () => fileInput.click() },
          `📎 ${t.shot.file}`,
        ),
        h(
          'button',
          { type: 'button', class: 'bp-shot-capture', onclick: () => capture() },
          `📸 ${t.shot.capture}`,
        ),
      ),
    ];
  }

  function render() {
    element.dataset.state = state;
    const body =
      state === 'empty'
        ? buildEmpty()
        : state === 'capturing'
          ? buildCapturing()
          : state === 'ready'
            ? buildReady()
            : buildFailed();
    element.replaceChildren(...body, errorEl, liveRegion, fileInput);
  }

  function setState(next: ShotState) {
    state = next;
    render();
    if (next === 'capturing') announce(t.shot.capturing);
    else if (next === 'failed') announce(t.shot.captureFailed);
  }

  function capture() {
    if (!deps) return;
    const gen = nextGeneration();
    clearImage();
    clearError();
    setState('capturing');
    const pending = deps
      .loadCapture()
      .catch(() => null)
      .then((captureFn) => {
        if (!captureFn) return null;
        return captureFn(host).catch(() => null);
      })
      .then((blob) => {
        if (gen !== generation) return;
        if (blob) {
          original = blob;
          setState('ready');
        } else {
          setState('failed');
        }
      });
    capturePromise = pending;
  }

  async function addImage(blob: Blob): Promise<void> {
    if (!deps) return;
    const gen = nextGeneration();
    const prepare = deps.prepare ?? prepareImage;
    try {
      const prepared = await prepare(blob);
      if (gen !== generation) return;
      clearImage();
      original = prepared;
      clearError();
      setState('ready');
    } catch (error) {
      if (gen !== generation) return;
      showError(errorMessage(t, error));
    }
  }

  async function openAnnotate(): Promise<void> {
    if (!deps || !original) return;
    const gen = generation;
    let loadFn: AnnotateFn | null;
    try {
      loadFn = await deps.loadAnnotate();
    } catch {
      loadFn = null;
    }
    if (gen !== generation) return;
    if (!loadFn) {
      showError(t.shot.editorUnavailable);
      focusThumb();
      return;
    }
    let outcome: Awaited<ReturnType<AnnotateFn>> = null;
    try {
      outcome = await loadFn({ image: original, strokes, t: t.annotate });
    } catch {
      outcome = null;
    }
    if (gen !== generation) return;
    if (outcome) {
      annotated = outcome.image;
      strokes = outcome.strokes;
      clearError();
      setState('ready');
    }
    focusThumb();
  }

  function remove() {
    if (!deps) return;
    nextGeneration();
    clearImage();
    clearError();
    setState('empty');
  }

  function handlePaste(event: ClipboardEvent): boolean {
    if (!deps) return false;
    const items = event.clipboardData?.items;
    if (!items) return false;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        void addImage(file);
        return true;
      }
    }
    return false;
  }

  function handleDrop(event: DragEvent): boolean {
    if (!deps) return false;
    const files = event.dataTransfer?.files;
    if (!files) return false;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        void addImage(file);
        return true;
      }
    }
    return false;
  }

  async function result(waitMs: number): Promise<Blob | null> {
    if (!deps) return null;
    if (state === 'capturing' && capturePromise) {
      await settlesWithin(capturePromise, waitMs);
    }
    return annotated ?? original ?? null;
  }

  function reset(auto: boolean) {
    nextGeneration();
    clearImage();
    clearError();
    capturePromise = null;
    if (preview) {
      // Ready-looking static placeholder: no image, all actions disabled.
      setState('ready');
      return;
    }
    if (auto) {
      capture();
    } else {
      setState('empty');
    }
  }

  function destroy() {
    revokeThumb();
  }

  render();

  return {
    element,
    state: () => state,
    reset,
    capture,
    addImage,
    handlePaste,
    handleDrop,
    result,
    destroy,
  };
}
