import { describe, expect, it, vi } from 'vitest';
import { h } from './h';

describe('h', () => {
  it('sets attributes and skips false/undefined', () => {
    const el = h('input', {
      type: 'email',
      maxlength: 10,
      required: true,
      disabled: false,
      title: undefined,
    });
    expect(el.getAttribute('type')).toBe('email');
    expect(el.getAttribute('maxlength')).toBe('10');
    expect(el.hasAttribute('required')).toBe(true);
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('binds on* functions as event listeners', () => {
    const onClick = vi.fn();
    const el = h('button', { onclick: onClick });
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(el.hasAttribute('onclick')).toBe(false);
  });

  it('renders string children as text, never as HTML', () => {
    const el = h('span', {}, '<img src=x onerror=alert(1)>');
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
  });

  it('appends node children and skips empty ones', () => {
    const el = h('div', {}, h('b', {}, 'x'), null, undefined, false, 'y');
    expect(el.childNodes).toHaveLength(2);
    expect(el.textContent).toBe('xy');
  });
});
