import { describe, expect, it } from 'vitest';
import en from './en.json';
import ru from './ru.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
}

describe('messages', () => {
  it('have identical keys and no empty strings in en and ru', () => {
    const a = flatten(en as Tree);
    const b = flatten(ru as Tree);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const value of [...Object.values(a), ...Object.values(b)])
      expect(value.trim()).not.toBe('');
  });
});
