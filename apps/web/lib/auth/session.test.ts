import { describe, expect, it } from 'vitest';
import { parseE2eUser } from './session';

describe('parseE2eUser', () => {
  it('accepts a JSON cookie with a uuid and email', () => {
    const raw = JSON.stringify({ id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10', email: 'a@b.co' });
    expect(parseE2eUser(raw)).toEqual({
      id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10',
      email: 'a@b.co',
    });
  });

  it.each([undefined, '', 'not json', JSON.stringify({ id: 'x', email: 'a@b.co' })])(
    'rejects %s',
    (raw) => {
      expect(parseE2eUser(raw)).toBeNull();
    },
  );
});
