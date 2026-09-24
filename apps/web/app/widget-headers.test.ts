import { describe, expect, it } from 'vitest';
import config from '../next.config';

async function headersFor(source: string) {
  const rules = (await config.headers?.()) ?? [];
  const rule = rules.find((r) => r.source === source);
  return Object.fromEntries((rule?.headers ?? []).map((h) => [h.key, h.value]));
}

describe('widget file headers', () => {
  // Host pages load these chunks with a cross-origin import(), which is a CORS request.
  for (const chunk of ['/w/screenshot.js', '/w/annotate.js']) {
    it(`${chunk} allows cross-origin module loads and is cached immutably`, async () => {
      const headers = await headersFor(chunk);
      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    });
  }

  it('/w/widget.js allows cross-origin loads', async () => {
    expect((await headersFor('/w/widget.js'))['Access-Control-Allow-Origin']).toBe('*');
  });
});
