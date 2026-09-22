import type { FeedbackType } from '@dymcode/shared';
import type { FeedbackMessage } from './types';

export const TYPE_STYLE: Record<FeedbackType, { emoji: string; label: string; color: number }> = {
  bug: { emoji: '🐞', label: 'Bug', color: 0xef4444 },
  idea: { emoji: '💡', label: 'Idea', color: 0x22c55e },
  general: { emoji: '💬', label: 'Other', color: 0x6366f1 },
};

const MESSAGE_LIMIT = 3000;
const ERROR_LIMIT = 200;
const MAX_ERRORS = 3;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function environmentLine(m: FeedbackMessage): string {
  const { browser, os, viewport, screen } = m.metadata;
  return `${browser} · ${os} · ${viewport.w}×${viewport.h} (screen ${screen.w}×${screen.h} @${screen.dpr}x)`;
}

/** Telegram HTML. Raw fields are truncated before escaping so markup is never cut in half. */
export function formatTelegram(m: FeedbackMessage): { full: string; short: string } {
  const style = TYPE_STYLE[m.type];
  const title = `${style.emoji} <b>${style.label}</b> · ${escapeHtml(truncate(m.projectName, 100))}`;
  const link = `<a href="${escapeHtml(m.dashboardUrl)}">Open in dashboard</a>`;
  const lines = [title, '', escapeHtml(truncate(m.message, MESSAGE_LIMIT)), ''];
  if (m.email) lines.push(`✉️ ${escapeHtml(truncate(m.email, 254))}`);
  lines.push(`🔗 ${escapeHtml(truncate(m.metadata.url, 300))}`);
  lines.push(`🖥 ${escapeHtml(environmentLine(m))}`);
  const errors = m.metadata.consoleErrors.slice(-MAX_ERRORS);
  if (errors.length) {
    lines.push('⚠️ Console errors:');
    for (const error of errors)
      lines.push(`<code>${escapeHtml(truncate(error.message, ERROR_LIMIT))}</code>`);
  }
  lines.push('', link);
  return { full: lines.join('\n'), short: `${title}\n${link}` };
}
