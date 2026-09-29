import { createHash, randomUUID } from 'node:crypto';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME_TYPES,
  SubmitPayloadSchema,
  type FeedbackMetadata,
} from '@bugping/shared';
import { ENTITLEMENTS } from '../billing/plans';
import type { Db } from '../db/types';
import type { Env } from '../env';
import { clientIp, corsHeaders, json, rateLimitIdentity } from '../http';
import type { Storage } from '../storage';
import { originAllowed, parseOrigin } from './origins';
import { loadProjectByKey, markOriginBlocked } from './project';
import { describeAgent } from './user-agent';

export const MAX_BODY_BYTES = 2.5 * 1024 * 1024;
const RATE_LIMIT = { max: 5, windowSeconds: 60 } as const;
const PROJECT_RATE_LIMIT = { max: 30, windowSeconds: 60 } as const;
const DAILY_IP_LIMIT = { max: 10, windowSeconds: 86_400 } as const;
const MIN_ELAPSED_MS = 800;
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface SubmitDeps {
  db: Db;
  storage: Storage;
  env: Pick<Env, 'IP_HASH_SALT' | 'CLIENT_IP_HEADER' | 'BUGPING_TEST_MODE'>;
  after: (task: () => Promise<void>) => void;
  notify: {
    feedback(feedbackId: string): Promise<void>;
    quotaNotice(projectId: string): Promise<void>;
  };
}

/** Recursively strips U+0000 and replaces lone surrogates (both rejected by Postgres text/jsonb). */
function stripNul<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/\u0000/g, '').toWellFormed() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNul(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, stripNul(val)]),
    ) as T;
  }
  return value;
}

export async function handleSubmit(deps: SubmitDeps, request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);
  try {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return json({ error: 'payload too large' }, 413, cors);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'invalid form data' }, 400, cors);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get('payload') ?? ''));
    } catch {
      return json({ error: 'payload is not JSON' }, 400, cors);
    }
    const parsed = SubmitPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return json({ error: 'invalid payload', issues }, 400, cors);
    }
    const payload = parsed.data;

    const file = form.get('screenshot');
    let screenshot: { data: Uint8Array; contentType: string } | null = null;
    if (file !== null) {
      const valid =
        file instanceof Blob &&
        (SCREENSHOT_MIME_TYPES as readonly string[]).includes(file.type) &&
        file.size <= SCREENSHOT_MAX_BYTES;
      if (!valid) return json({ error: 'invalid screenshot' }, 400, cors);
      screenshot = { data: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
    }

    const ipHash = createHash('sha256')
      .update(
        rateLimitIdentity(clientIp(request.headers, deps.env.CLIENT_IP_HEADER)) +
          deps.env.IP_HASH_SALT,
      )
      .digest('hex');
    const [limit] = await deps.db.query<{ limited: boolean }>(
      'select public.hit_rate_limit($1, $2, $3) as limited',
      [`submit:${payload.projectKey}:${ipHash}`, RATE_LIMIT.max, RATE_LIMIT.windowSeconds],
    );
    if (limit?.limited) return json({ error: 'rate limited' }, 429, cors);
    const [projectLimit] = await deps.db.query<{ limited: boolean }>(
      'select public.hit_rate_limit($1, $2, $3) as limited',
      [
        `submit-project:${payload.projectKey}`,
        PROJECT_RATE_LIMIT.max,
        PROJECT_RATE_LIMIT.windowSeconds,
      ],
    );
    if (projectLimit?.limited) return json({ error: 'rate limited' }, 429, cors);
    if (deps.env.BUGPING_TEST_MODE !== '1') {
      const [dayLimit] = await deps.db.query<{ limited: boolean }>(
        'select public.hit_rate_limit($1, $2, $3) as limited',
        [
          `submit-day:${payload.projectKey}:${ipHash}`,
          DAILY_IP_LIMIT.max,
          DAILY_IP_LIMIT.windowSeconds,
        ],
      );
      if (dayLimit?.limited) return json({ error: 'rate limited' }, 429, cors);
    }

    const project = await loadProjectByKey(deps.db, payload.projectKey);
    if (!project) return json({ error: 'unknown project' }, 404, cors);
    if (!originAllowed(origin, project.allowed_origins)) {
      const blocked = parseOrigin(origin);
      if (blocked) {
        deps.after(() =>
          markOriginBlocked(deps.db, project.id, blocked).catch((error) =>
            console.error('[widget/submit] blocked origin', error),
          ),
        );
      }
      return json({ error: 'origin not allowed' }, 403, cors);
    }
    if (payload.website || payload.elapsedMs < MIN_ELAPSED_MS) return json({ id: null }, 200, cors);

    const [usage] = await deps.db.query<{ count: number }>(
      'select public.consume_quota($1) as count',
      [project.owner_id],
    );
    const overQuota = !project.pro && (usage?.count ?? 0) > ENTITLEMENTS.free.monthlySubmissions;

    const id = randomUUID();
    let screenshotPath: string | null = null;
    if (screenshot) {
      const path = `${project.id}/${id}.${EXTENSIONS[screenshot.contentType]}`;
      try {
        await deps.storage.upload(path, screenshot.data, screenshot.contentType);
        screenshotPath = path;
      } catch (error) {
        console.error('[widget/submit] screenshot upload failed', error);
      }
    }

    const message = stripNul(payload.message);
    const email = payload.email ? stripNul(payload.email) : null;
    const metadata: FeedbackMetadata = stripNul({
      ...payload.metadata,
      ...describeAgent(payload.metadata.userAgent),
    });
    try {
      // `$7::text::jsonb` with a JSON string: the parameter is typed `text`, so no driver
      // (postgres.js, pg, PGlite) JSON-encodes it a second time into a jsonb string.
      await deps.db.query(
        `insert into public.feedback
           (id, project_id, type, message, email, screenshot_path, metadata, over_quota)
         values ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8)`,
        [
          id,
          project.id,
          payload.type,
          message,
          email,
          screenshotPath,
          JSON.stringify(metadata),
          overQuota,
        ],
      );
    } catch (error) {
      if (screenshotPath) await deps.storage.remove([screenshotPath]).catch(() => {});
      throw error;
    }

    deps.after(async () => {
      try {
        if (!overQuota) {
          await deps.notify.feedback(id);
          return;
        }
        const [claim] = await deps.db.query<{ ok: boolean }>(
          'select public.claim_quota_notice($1) as ok',
          [project.owner_id],
        );
        if (claim?.ok) await deps.notify.quotaNotice(project.id);
      } catch (error) {
        console.error('[widget/submit] notification failed', error);
      }
    });

    return json({ id }, 201, cors);
  } catch (error) {
    console.error('[widget/submit]', error);
    return json({ error: 'internal' }, 500, cors);
  }
}
