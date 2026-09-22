import { domToCanvas } from 'modern-screenshot';
import { describe, expect, it, vi } from 'vitest';
import { capture, maskClonedNode } from './screenshot';

vi.mock('modern-screenshot', () => ({
  domToCanvas: vi.fn(async () => document.createElement('canvas')),
}));

describe('capture', () => {
  it('bounds resource loading with a 5s timeout', async () => {
    await capture(document.createElement('div'));
    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ timeout: 5000 }),
    );
  });
});

describe('maskClonedNode', () => {
  it('clears value and sets filter on password input', () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.value = 'secret';
    maskClonedNode(input);
    expect(input.value).toBe('');
    expect(input.hasAttribute('value')).toBe(false);
    expect(input.style.filter).toBe('brightness(0)');
  });

  it('sets filter on [data-feedback-mask] elements', () => {
    const div = document.createElement('div');
    div.setAttribute('data-feedback-mask', '');
    maskClonedNode(div);
    expect(div.style.filter).toBe('brightness(0)');
  });

  it('paints masked elements solid black so transparent-background text is unreadable', () => {
    const span = document.createElement('span');
    span.setAttribute('data-feedback-mask', '');
    span.setAttribute('style', 'color: green; background: transparent');
    maskClonedNode(span);
    expect(span.style.getPropertyValue('background-color')).toBe('#000');
    expect(span.style.getPropertyPriority('background')).toBe('important');
    expect(span.style.getPropertyValue('color')).toBe('#000');
    expect(span.style.getPropertyPriority('color')).toBe('important');
    expect(span.style.getPropertyPriority('filter')).toBe('important');
  });

  it('does not modify ordinary inputs with values', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'visible';
    maskClonedNode(input);
    expect(input.value).toBe('visible');
    expect(input.style.filter).toBe('');
  });

  it('does not throw on text nodes', () => {
    const text = document.createTextNode('some text');
    expect(() => maskClonedNode(text)).not.toThrow();
  });

  it('preserves existing inline styles without trailing semicolon', () => {
    const div = document.createElement('div');
    div.setAttribute('data-feedback-mask', '');
    div.setAttribute('style', 'width:200px');
    maskClonedNode(div);
    expect(div.style.filter).toBe('brightness(0)');
    expect(div.style.width).toBe('200px');
  });

  it('preserves existing styles on password input without trailing semicolon', () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.value = 'secret';
    input.setAttribute('style', 'width:120px');
    maskClonedNode(input);
    expect(input.style.filter).toBe('brightness(0)');
    expect(input.style.width).toBe('120px');
    expect(input.value).toBe('');
  });
});
