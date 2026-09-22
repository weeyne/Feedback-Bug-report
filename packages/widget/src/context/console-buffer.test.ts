import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installConsoleBuffer, type ConsoleBuffer } from './console-buffer';

const OWN = 'https://dymcode.dev/w/widget.js';

describe('installConsoleBuffer', () => {
  let buffer: ConsoleBuffer;
  let original: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    original = vi.fn();
    console.error = original as unknown as typeof console.error;
    buffer = installConsoleBuffer(window, OWN);
  });

  afterEach(() => buffer.dispose());

  it('records window error events with source and line', () => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'boom',
        filename: 'https://host.example/app.js',
        lineno: 7,
      }),
    );
    expect(buffer.entries()).toEqual([
      { message: 'boom', source: 'https://host.example/app.js', line: 7, at: expect.any(Number) },
    ]);
  });

  it('records unhandled rejections', () => {
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new TypeError('nope') }),
    );
    expect(buffer.entries()[0]?.message).toBe('TypeError: nope');
  });

  it('records console.error and still calls the original', () => {
    console.error('failed to load', { id: 3 });
    expect(original).toHaveBeenCalledWith('failed to load', { id: 3 });
    expect(buffer.entries()[0]?.message).toBe('failed to load {"id":3}');
  });

  it('keeps only the last 10 entries', () => {
    for (let i = 0; i < 12; i++) console.error(`e${i}`);
    const messages = buffer.entries().map((e) => e.message);
    expect(messages).toHaveLength(10);
    expect(messages[0]).toBe('e2');
    expect(messages[9]).toBe('e11');
  });

  it('truncates messages to 500 chars', () => {
    console.error('x'.repeat(600));
    expect(buffer.entries()[0]?.message).toHaveLength(500);
  });

  it('ignores errors coming from the widget itself', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ours', filename: OWN, lineno: 1 }));
    const err = new Error('ours too');
    err.stack = `Error: ours too\n    at x (${OWN}:1:2)`;
    console.error(err);
    expect(buffer.entries()).toEqual([]);
  });

  it('dispose restores console.error and stops recording', () => {
    buffer.dispose();
    expect(console.error).toBe(original);
    window.dispatchEvent(new ErrorEvent('error', { message: 'late' }));
    expect(buffer.entries()).toEqual([]);
  });

  it('console.error(circularNullProto) does not throw, calls original, and records', () => {
    const x = Object.create(null);
    x.self = x;
    expect(() => console.error(x)).not.toThrow();
    expect(original).toHaveBeenCalledWith(x);
    expect(buffer.entries()).toHaveLength(1);
  });

  it('console.error(throwingToJSON) does not throw and original is called', () => {
    const obj = {
      toJSON() {
        throw new Error('toJSON throws');
      },
      toString() {
        throw new Error('toString throws');
      },
      [Symbol.toPrimitive]() {
        throw new Error('toPrimitive throws');
      },
    };
    expect(() => console.error(obj)).not.toThrow();
    expect(original).toHaveBeenCalledWith(obj);
    expect(buffer.entries()).toHaveLength(1);
  });
});
