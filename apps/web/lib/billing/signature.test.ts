import { describe, expect, it } from 'vitest';
import { signPaddle, verifyPaddleSignature } from './signature';

const SECRET = 'pdl_ntfset_0123456789abcdef';
const BODY = '{"event_id":"evt_1"}';
const NOW = 1_790_000_000_000;
const TS = Math.floor(NOW / 1000);

describe('Paddle signature', () => {
  it('accepts a valid signature', () => {
    expect(verifyPaddleSignature(BODY, signPaddle(BODY, SECRET, TS), SECRET, NOW)).toBe(true);
  });

  it('accepts a header with several h1 values when one matches', () => {
    const good = signPaddle(BODY, SECRET, TS).split(';h1=')[1];
    expect(
      verifyPaddleSignature(BODY, `ts=${TS};h1=${'0'.repeat(64)};h1=${good}`, SECRET, NOW),
    ).toBe(true);
  });

  it.each([
    ['wrong secret', BODY, signPaddle(BODY, 'other-secret-0000', TS), NOW],
    ['tampered body', `${BODY} `, signPaddle(BODY, SECRET, TS), NOW],
    ['stale timestamp', BODY, signPaddle(BODY, SECRET, TS - 301), NOW],
    ['future timestamp', BODY, signPaddle(BODY, SECRET, TS + 301), NOW],
    ['missing header', BODY, null, NOW],
    ['malformed header', BODY, 'nonsense', NOW],
    ['non-hex h1', BODY, `ts=${TS};h1=zz`, NOW],
  ] as const)('rejects %s', (_label, body, header, now) => {
    expect(verifyPaddleSignature(body, header, SECRET, now)).toBe(false);
  });
});
