import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  PUBLIC_KEY_PATTERN,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  SubmitPayloadSchema,
  WIDGET_LOCALES,
  buildBadgeUrl,
  type WidgetConfig,
  type WidgetLocale,
} from '@dymcode/shared';
import type { Plugin } from 'vite';

export interface MockSubmission {
  status: number;
  payload: unknown;
  screenshot: { type: string; size: number } | null;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Overrides come from the page that embeds the widget, e.g. /dev/index.html?locale=ru&badge=0. */
function configFor(key: string, req: IncomingMessage): WidgetConfig {
  const page = new URL(req.headers.referer ?? 'http://localhost/');
  const q = page.searchParams;
  const locale = q.get('locale');
  return {
    primaryColor: /^[0-9a-fA-F]{6}$/.test(q.get('color') ?? '') ? `#${q.get('color')}` : '#6366f1',
    triggerText: q.get('text') ?? 'Feedback',
    position: q.get('position') === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    showBadge: q.get('badge') !== '0',
    customCss: null,
    badgeUrl: buildBadgeUrl(key),
    locale: (WIDGET_LOCALES as readonly string[]).includes(locale ?? '')
      ? (locale as WidgetLocale)
      : 'auto',
  };
}

async function readForm(req: IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const request = new Request('http://localhost/submit', {
    method: 'POST',
    headers,
    body: Readable.toWeb(req) as unknown as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  return request.formData();
}

/** Dev/E2E stand-in for the phase-3 API, validating with the same shared schemas. */
export function mockApi(): Plugin {
  let last: MockSubmission | null = null;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/src/screenshot.js') {
      // Source mode: widget asks for screenshot.js next to src/entry.ts; serve the TS module.
      req.url = `/src/screenshot.ts${url.search}`;
      return false;
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/widget/config') {
      const key = url.searchParams.get('key') ?? '';
      if (!PUBLIC_KEY_PATTERN.test(key)) sendJson(res, 404, { error: 'unknown project' });
      else sendJson(res, 200, configFor(key, req));
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/widget/submit') {
      const form = await readForm(req);
      let json: unknown = null;
      try {
        json = JSON.parse(String(form.get('payload')));
      } catch {
        sendJson(res, 400, { error: 'payload is not JSON' });
        return true;
      }
      const file = form.get('screenshot');
      let screenshot: MockSubmission['screenshot'] = null;
      if (file instanceof Blob) {
        screenshot = { type: file.type, size: file.size };
        const okType = (SCREENSHOT_MIME_TYPES as readonly string[]).includes(file.type);
        if (!okType || file.size > SCREENSHOT_MAX_BYTES) {
          last = { status: 400, payload: json, screenshot };
          sendJson(res, 400, { error: 'bad screenshot' });
          return true;
        }
      }
      const parsed = SubmitPayloadSchema.safeParse(json);
      if (!parsed.success) {
        last = { status: 400, payload: json, screenshot };
        sendJson(res, 400, { issues: parsed.error.issues });
      } else if (parsed.data.website || parsed.data.elapsedMs < 2000) {
        last = { status: 200, payload: parsed.data, screenshot };
        sendJson(res, 200, { id: null });
      } else {
        last = { status: 201, payload: parsed.data, screenshot };
        sendJson(res, 201, { id: randomUUID() });
      }
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/__mock/last-submission') {
      sendJson(res, 200, last);
      return true;
    }
    return false;
  }

  return {
    name: 'dymcode-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handle(req, res).then(
          (handled) => {
            if (!handled) next();
          },
          (error: unknown) => sendJson(res, 500, { error: String(error) }),
        );
      });
    },
  };
}
