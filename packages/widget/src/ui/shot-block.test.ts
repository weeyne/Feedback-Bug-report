import { describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../i18n';
import { ImageError } from '../image/prepare';
import { createShotBlock, type ShotBlockDeps } from './shot-block';

const t = MESSAGES.en;
const shot = new Blob(['shot'], { type: 'image/webp' });
const host = document.createElement('div');
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(deps: Partial<ShotBlockDeps> = {}) {
  const full: ShotBlockDeps = {
    loadCapture: async () => async () => shot,
    loadAnnotate: async () => null,
    prepare: async (b) => new Blob([b], { type: 'image/webp' }),
    ...deps,
  };
  const block = createShotBlock({ t, deps: full, host });
  document.body.append(block.element);
  const q = (s: string) => block.element.querySelector<HTMLElement>(s);
  return { block, q, deps: full };
}

describe('shot block', () => {
  it('auto-captures when reset(true)', async () => {
    const { block } = setup();
    block.reset(true);
    expect(block.state()).toBe('capturing');
    await flush();
    expect(block.state()).toBe('ready');
    expect(await block.result(8000)).toBe(shot);
  });
  it('stays empty when reset(false)', () => {
    const { block, q } = setup();
    block.reset(false);
    expect(block.state()).toBe('empty');
    expect(q('.bp-shot-capture')).not.toBeNull();
  });
  it('shows failed when capture is unavailable', async () => {
    const { block } = setup({ loadCapture: async () => null });
    block.reset(true);
    await flush();
    expect(block.state()).toBe('failed');
    expect(await block.result(8000)).toBeNull();
  });
  it('adds a pasted image and ignores text paste', async () => {
    const { block } = setup();
    block.reset(false);
    const file = new File(['p'], 'p.png', { type: 'image/png' });
    const imageEvent = {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    const textEvent = {
      clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(block.handlePaste(textEvent)).toBe(false);
    expect(block.handlePaste(imageEvent)).toBe(true);
    await flush();
    expect(block.state()).toBe('ready');
  });
  it('keeps the previous image and shows an error for a bad file', async () => {
    const { block, q } = setup({
      prepare: async () => Promise.reject(new ImageError('not_image')),
    });
    block.reset(true);
    await flush();
    await block.addImage(new Blob(['x'], { type: 'text/plain' }));
    expect(block.state()).toBe('ready');
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.notImage);
    expect(await block.result(8000)).toBe(shot);
  });
  it('sends the annotated image and reopens the editor with the original and strokes', async () => {
    const annotated = new Blob(['a'], { type: 'image/webp' });
    const annotate = vi.fn(async () => ({
      image: annotated,
      strokes: [
        {
          tool: 'rect' as const,
          points: [
            [0, 0],
            [9, 9],
          ] as [number, number][],
        },
      ],
    }));
    const { block, q } = setup({ loadAnnotate: async () => annotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(await block.result(8000)).toBe(annotated);
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(annotate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        image: shot,
        strokes: [
          {
            tool: 'rect',
            points: [
              [0, 0],
              [9, 9],
            ],
          },
        ],
      }),
    );
  });
  it('a new image discards annotations', async () => {
    const annotate = vi.fn(async () => ({ image: new Blob(['a']), strokes: [] }));
    const { block, q } = setup({ loadAnnotate: async () => annotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    const replacement = new Blob(['new'], { type: 'image/png' });
    await block.addImage(replacement);
    const sent = await block.result(8000);
    expect(await sent!.text()).toBe('new');
  });
  it('shows editor unavailable when the chunk fails', async () => {
    const { block, q } = setup();
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.editorUnavailable);
    expect(block.state()).toBe('ready');
  });
  it('remove returns to empty', async () => {
    const { block, q } = setup();
    block.reset(true);
    await flush();
    q('.bp-shot-remove')!.click();
    expect(block.state()).toBe('empty');
    expect(await block.result(8000)).toBeNull();
  });
  it('drops a stale capture after reset', async () => {
    let finish!: (b: Blob) => void;
    const { block } = setup({
      loadCapture: async () => () => new Promise<Blob>((r) => (finish = r)),
    });
    block.reset(true);
    await flush();
    block.reset(false);
    finish(shot);
    await flush();
    expect(block.state()).toBe('empty');
  });
  it('result() waits for an addImage started while a capture is still pending', async () => {
    let finishCapture!: (b: Blob) => void;
    let finishPrepare!: (b: Blob) => void;
    const pasted = new Blob(['pasted'], { type: 'image/webp' });
    const { block } = setup({
      loadCapture: async () => () => new Promise<Blob>((r) => (finishCapture = r)),
      prepare: () => new Promise<Blob>((r) => (finishPrepare = r)),
    });
    block.reset(true);
    await flush();
    expect(block.state()).toBe('capturing');
    // A paste arrives while the capture is still pending: it must become the operation result()
    // waits for, not the stale capture that resolves later.
    void block.addImage(new Blob(['p'], { type: 'image/png' }));
    const resultPromise = block.result(8000);
    finishCapture(shot);
    await flush();
    // The capture may still land (the paste has not succeeded yet), but the paste then wins.
    expect(block.state()).toBe('ready');
    finishPrepare(pasted);
    expect(await resultPromise).toBe(pasted);
  });
  it('a pending capture is discarded once a pasted image is prepared', async () => {
    let finishCapture!: (b: Blob) => void;
    const pasted = new Blob(['pasted'], { type: 'image/webp' });
    const { block } = setup({
      loadCapture: async () => () => new Promise<Blob>((r) => (finishCapture = r)),
      prepare: async () => pasted,
    });
    block.reset(true);
    await flush();
    await block.addImage(new Blob(['p'], { type: 'image/png' }));
    expect(block.state()).toBe('ready');
    finishCapture(shot);
    await flush();
    expect(await block.result(8000)).toBe(pasted);
  });
  it('an own image that fails while a capture is pending keeps the capture', async () => {
    let finishCapture!: (b: Blob) => void;
    const { block, q } = setup({
      loadCapture: async () => () => new Promise<Blob>((r) => (finishCapture = r)),
      prepare: async () => Promise.reject(new ImageError('too_large')),
    });
    block.reset(true);
    await flush();
    expect(block.state()).toBe('capturing');
    await block.addImage(new Blob(['x'], { type: 'image/png' }));
    expect(block.state()).toBe('capturing');
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.tooLarge);
    const resultPromise = block.result(8000);
    finishCapture(shot);
    await flush();
    expect(block.state()).toBe('ready');
    expect(q('.bp-shot-error')?.textContent).toBe(t.shot.tooLarge);
    expect(await resultPromise).toBe(shot);
  });
  it('a re-render keeps focus inside the block when it removes the focused control', async () => {
    const { block, q } = setup({ loadCapture: async () => null });
    block.reset(true);
    await flush();
    expect(block.state()).toBe('failed');
    q('.bp-shot-capture')!.focus();
    q('.bp-shot-capture')!.click();
    expect(block.element.contains(document.activeElement)).toBe(true);
    await flush();
    expect(block.state()).toBe('failed');
    expect(document.activeElement).toBe(q('.bp-shot-file'));
  });
  it('a re-render leaves focus alone when it was elsewhere', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    const { block } = setup();
    block.reset(true);
    await flush();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
  it('ignores Annotate and thumbnail clicks while the editor is loading or open', async () => {
    let finishEditor!: (v: null) => void;
    const annotate = vi.fn(() => new Promise<null>((r) => (finishEditor = r)));
    const loadAnnotate = vi.fn(async () => annotate);
    const { block, q } = setup({ loadAnnotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    q('.bp-thumb')!.click();
    expect(q('.bp-shot-annotate')!.getAttribute('aria-disabled')).toBe('true');
    expect(q('.bp-thumb')!.getAttribute('aria-disabled')).toBe('true');
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(loadAnnotate).toHaveBeenCalledOnce();
    expect(annotate).toHaveBeenCalledOnce();
    finishEditor(null);
    await flush();
    expect(q('.bp-shot-annotate')!.hasAttribute('aria-disabled')).toBe(false);
    expect(q('.bp-thumb')!.hasAttribute('aria-disabled')).toBe(false);
    q('.bp-thumb')!.click();
    await flush();
    expect(annotate).toHaveBeenCalledTimes(2);
  });
  it('re-enables Annotate after the editor returns an image', async () => {
    const annotate = vi.fn(async () => ({ image: new Blob(['a']), strokes: [] }));
    const { block, q } = setup({ loadAnnotate: async () => annotate });
    block.reset(true);
    await flush();
    q('.bp-shot-annotate')!.click();
    await flush();
    expect(q('.bp-shot-annotate')!.hasAttribute('aria-disabled')).toBe(false);
    expect(document.activeElement).toBe(q('.bp-thumb'));
  });
  it('a paste with text into a text field keeps the text, even with an image alongside', () => {
    const { block } = setup();
    block.reset(false);
    const file = new File(['p'], 'p.png', { type: 'image/png' });
    const items = [
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/png', getAsFile: () => file },
    ];
    const textarea = document.createElement('textarea');
    const intoField = {
      target: textarea,
      clipboardData: { items },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(block.handlePaste(intoField)).toBe(false);
    expect(intoField.preventDefault).not.toHaveBeenCalled();
    expect(block.state()).toBe('empty');

    // The same clipboard pasted outside a text field attaches the image.
    const elsewhere = {
      target: block.element,
      clipboardData: { items },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(block.handlePaste(elsewhere)).toBe(true);
    expect(elsewhere.preventDefault).toHaveBeenCalled();
  });
  it('an image-only paste into a text field attaches the image', () => {
    const { block } = setup();
    block.reset(false);
    const file = new File(['p'], 'p.png', { type: 'image/png' });
    const event = {
      target: document.createElement('textarea'),
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    expect(block.handlePaste(event)).toBe(true);
  });
  it('destroy() stops late results from rendering a thumbnail', async () => {
    let finishCapture!: (b: Blob) => void;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const { block } = setup({
      loadCapture: async () => () => new Promise<Blob>((r) => (finishCapture = r)),
    });
    block.reset(true);
    await flush();
    block.destroy();
    finishCapture(shot);
    await flush();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(block.state()).toBe('capturing');
    createObjectURL.mockRestore();
  });
  it('result() gives up on a capture that is still pending after waitMs', async () => {
    vi.useFakeTimers();
    const { block } = setup({ loadCapture: async () => () => new Promise<Blob>(() => {}) });
    block.reset(true);
    const pending = block.result(8000);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
  it('preview renders a disabled placeholder and never captures', () => {
    const block = createShotBlock({ t, deps: null, host });
    block.reset(true);
    expect(block.element.querySelectorAll('button:not([disabled])')).toHaveLength(0);
  });
});
