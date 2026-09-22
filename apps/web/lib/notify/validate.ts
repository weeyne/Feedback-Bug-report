const DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);
const BOT_TOKEN = /^\d+:[\w-]+$/;

export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    DISCORD_HOSTS.has(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname.startsWith('/api/webhooks/')
  );
}

export function isBotToken(value: string): boolean {
  return BOT_TOKEN.test(value);
}
