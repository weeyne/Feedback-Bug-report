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

function isTextField(target: EventTarget | null): boolean {
  const tag = (target as Element | null)?.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT';
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
  /** Orders addImage calls among themselves: only the newest one may apply its result. */
  let imageSeq = 0;
  /** The editor is loading or open: further Annotate/thumbnail clicks are ignored. */
  let annotating = false;
  /**
   * The in-flight async operation for the current generation (capture, or an addImage prepare).
   * `result()` waits on this — reassigned synchronously (before any await) by every op that starts
   * one, so a newer operation always wins over a stale one still settling in the background.
   */
  let pending: Promise<void> = Promise.resolve();

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

  // tabindex -1: a focus target of last resort when a re-render removes the focused control.
  const element = h('div', { class: 'bp-shot', 'data-state': state, tabindex: -1 });

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

  /** Where focus goes when a re-render removed the focused control: never out of the block. */
  function focusBest() {
    const target =
      state === 'ready'
        ? element.querySelector<HTMLElement>('button.bp-thumb:not([disabled])')
        : element.querySelector<HTMLElement>('.bp-shot-actions button:not([disabled])');
    (target ?? element).focus();
  }

  function focusedElement(): Element | null {
    const root = element.getRootNode() as Document | ShadowRoot | Node;
    return 'activeElement' in root ? root.activeElement : null;
  }

  function setAnnotating(value: boolean) {
    annotating = value;
    for (const control of element.querySelectorAll('.bp-thumb, .bp-shot-annotate')) {
      if (value) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    }
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
          'aria-disabled': annotating ? 'true' : undefined,
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
            'aria-disabled': annotating ? 'true' : undefined,
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
    const active = focusedElement();
    const hadFocus = active !== null && element.contains(active);
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
    // replaceChildren drops focus to <body> when it removes the focused control, which would
    // take it out of the panel (and its Tab trap and Escape handling): keep it in the block.
    if (!hadFocus) return;
    const now = focusedElement();
    if (now === null || now === element || !element.contains(now)) focusBest();
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
    pending = deps
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
  }

  /**
   * Prepares a visitor's own image. The current image — or a capture still in flight — is only
   * replaced once preparation succeeds: on an error both are kept and the reason is shown.
   */
  function addImage(blob: Blob): Promise<void> {
    if (!deps) return Promise.resolve();
    const seq = ++imageSeq;
    const gen = generation;
    const prepare = deps.prepare ?? prepareImage;
    const previous = pending;
    const current = () => seq === imageSeq && gen === generation;
    const task: Promise<void> = Promise.resolve()
      .then(() => prepare(blob))
      .then(
        (prepared) => {
          if (!current()) return;
          nextGeneration(); // supersedes a pending capture and any editor open on the old image
          clearImage();
          original = prepared;
          clearError();
          setState('ready');
        },
        (error: unknown) => {
          if (!current()) return;
          showError(errorMessage(t, error));
          // result() goes back to waiting on whatever this attempt had replaced (e.g. a capture).
          if (pending === task) pending = previous;
        },
      );
    pending = task;
    return task;
  }

  async function openAnnotate(): Promise<void> {
    if (!deps || !original || annotating) return;
    setAnnotating(true);
    try {
      await runEditor();
    } finally {
      setAnnotating(false);
    }
  }

  async function runEditor(): Promise<void> {
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
      annotating = false; // so the re-rendered controls come back enabled
      setState('ready');
    }
    focusThumb();
  }

  function remove() {
    if (!deps) return;
    nextGeneration();
    clearImage();
    clearError();
    pending = Promise.resolve();
    setState('empty');
  }

  function handlePaste(event: ClipboardEvent): boolean {
    if (!deps) return false;
    const items = event.clipboardData?.items;
    if (!items) return false;
    const list = Array.from(items);
    // Text copied from e.g. Office also carries a rendered image of it: pasted into a text field,
    // the visitor wants the text.
    const hasText = list.some((item) => item.kind === 'string' && item.type === 'text/plain');
    if (hasText && isTextField(event.target)) return false;
    for (const item of list) {
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

  /**
   * Waits up to `waitMs` (total, not per attempt) for whatever is currently pending — a capture or
   * an addImage prepare — for the *current* generation. If a newer operation replaces `pending`
   * while this is waiting (e.g. a paste arrives mid-capture), it keeps waiting on that one instead,
   * still bounded by the same overall deadline, so the newest operation always wins.
   */
  async function result(waitMs: number): Promise<Blob | null> {
    if (!deps) return null;
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        expired = true;
        resolve();
      }, waitMs);
    });
    try {
      let waitedFor = pending;
      for (;;) {
        await Promise.race([
          waitedFor.then(
            () => undefined,
            () => undefined,
          ),
          timeout,
        ]);
        if (expired || waitedFor === pending) break;
        waitedFor = pending;
      }
    } finally {
      clearTimeout(timer);
    }
    return annotated ?? original ?? null;
  }

  function reset(auto: boolean) {
    nextGeneration();
    clearImage();
    clearError();
    pending = Promise.resolve();
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
    // Late async results (capture, prepare, editor) must never create object URLs after this.
    nextGeneration();
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
