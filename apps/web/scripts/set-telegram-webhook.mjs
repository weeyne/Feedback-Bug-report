// Registers the shared bot webhook. Usage:
//   pnpm --filter @bugping/web telegram:set-webhook https://your-domain/api/telegram/webhook
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from the environment or apps/web/.env.local.
// Never prints secrets.
import { existsSync, readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url || !url.startsWith('https://')) {
  console.error(
    'Usage: pnpm --filter @bugping/web telegram:set-webhook https://<domain>/api/telegram/webhook',
  );
  process.exit(1);
}

const file = new URL('../.env.local', import.meta.url);
const fromFile = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1).trim(),
        ]),
    )
  : {};
const env = { ...fromFile, ...process.env };
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  }),
});
const data = await response.json();
console.log(data.ok ? `Webhook set to ${url}` : `Failed: ${data.description}`);
process.exit(data.ok ? 0 : 1);
