import { describe, expect, it } from 'vitest';
import { isBotToken, isDiscordWebhookUrl } from './validate';

describe('validators', () => {
  it.each([
    ['https://discord.com/api/webhooks/1/abc', true],
    ['https://canary.discord.com/api/webhooks/1/abc', true],
    ['http://discord.com/api/webhooks/1/abc', false],
    ['https://discord.com.evil.tld/api/webhooks/1/abc', false],
    ['https://discord.com@evil.tld/api/webhooks/1/abc', false],
    ['https://discord.com/other', false],
    ['not a url', false],
  ])('isDiscordWebhookUrl(%s) = %s', (value, expected) => {
    expect(isDiscordWebhookUrl(value)).toBe(expected);
  });

  it.each([
    ['123456:ABC-def_g', true],
    ['123:abc/../x', false],
    ['bot:123', false],
    ['', false],
  ])('isBotToken(%s) = %s', (value, expected) => {
    expect(isBotToken(value)).toBe(expected);
  });
});
