import { describe, expect, it } from 'vitest';
import { maskClonedNode } from './screenshot';

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
});
