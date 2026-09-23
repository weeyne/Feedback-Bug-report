import { createTranslator, type IntlError } from 'next-intl';
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

// Dummy values covering every ICU argument name used across en.json/ru.json
// (feedback.hidden, feedback.usage/billing.usage, settings.cssBytes,
// integrations.*, billing.current and billing.renews/endsOn). Passing one
// superset object keeps this test independent from which locale/key is
// being formatted.
const dummyValues = {
  count: 1,
  used: 1,
  limit: 10,
  max: 100,
  plan: 'Pro',
  bot: 'test_bot',
  message: 'Something went wrong',
  time: '12:00',
  username: 'test_user',
  date: 'September 1, 2026',
  email: 'someone@example.com',
};

describe('messages', () => {
  it('have identical keys and no empty strings in en and ru', () => {
    const a = flatten(en as Tree);
    const b = flatten(ru as Tree);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const value of [...Object.values(a), ...Object.values(b)])
      expect(value.trim()).not.toBe('');
  });

  it.each([
    ['en', en],
    ['ru', ru],
  ])('formats every message leaf without ICU errors (%s)', (locale, messages) => {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages,
      onError: (error: IntlError) => {
        errors.push(`${error.code}: ${error.message}`);
      },
    });

    const keys = Object.keys(flatten(messages as Tree));
    for (const key of keys) {
      // Keys are dynamic (not string literals), so next-intl's key-based
      // overload resolution can't narrow the values type here; the dummy
      // values above are a superset of every ICU argument name in use.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t(key as any, dummyValues);
    }

    expect(errors).toEqual([]);
  });

  it('renders the install page hints literally (no ICU interpretation)', () => {
    const tEn = createTranslator({ locale: 'en', messages: en });
    expect(tEn('install.intro')).toBe(
      'Paste this snippet before the closing </body> tag of your site.',
    );
    expect(tEn('install.identifyHint')).toBe(
      'Call Bugping.identify({ email, id, name }) after sign-in.',
    );
  });
});
