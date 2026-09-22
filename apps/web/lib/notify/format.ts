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
const FINAL_LIMIT = 4096;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeHtmlLimited(text: string, maxEscapedLength: number): string {
  let result = '';
  let length = 0;
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  };

  for (const char of text) {
    const escaped = entities[char] ?? char;
    const newLength = length + escaped.length;

    if (newLength > maxEscapedLength) {
      // Stop before exceeding the budget; check if we have room for the ellipsis
      if (length + 1 <= maxEscapedLength) {
        result += '…';
      } else if (result.length > 0) {
        // Replace last char with ellipsis if needed
        result = result.slice(0, -1) + '…';
      }
      break;
    }

    result += escaped;
    length = newLength;
  }

  return result;
}

export const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function environmentLine(m: FeedbackMessage): string {
  const { browser, os, viewport, screen } = m.metadata;
  return `${browser} · ${os} · ${viewport.w}×${viewport.h} (screen ${screen.w}×${screen.h} @${screen.dpr}x)`;
}

/** Telegram HTML. Escapes with budgets on escaped length to stay within 4096 limit. */
export function formatTelegram(m: FeedbackMessage): { full: string; short: string } {
  const style = TYPE_STYLE[m.type];
  const title = `${style.emoji} <b>${style.label}</b> · ${escapeHtmlLimited(m.projectName, 100)}`;
  const link = `<a href="${escapeHtml(m.dashboardUrl)}">Open in dashboard</a>`;
  let messageContent = escapeHtmlLimited(m.message, MESSAGE_LIMIT);
  const lines = [title, '', messageContent, ''];
  if (m.email) lines.push(`✉️ ${escapeHtmlLimited(m.email, 254)}`);
  lines.push(`🔗 ${escapeHtmlLimited(m.metadata.url, 300)}`);
  lines.push(`🖥 ${escapeHtml(environmentLine(m))}`);
  let errors = m.metadata.consoleErrors.slice(-MAX_ERRORS);
  const errorLines: string[] = [];
  if (errors.length) {
    lines.push('⚠️ Console errors:');
    for (const error of errors)
      errorLines.push(`<code>${escapeHtmlLimited(error.message, ERROR_LIMIT)}</code>`);
    lines.push(...errorLines);
  }
  lines.push('', link);

  let full = lines.join('\n');

  // Final guarantee: if full still exceeds 4096, reduce message budget then drop console errors
  if (full.length > FINAL_LIMIT) {
    const overhead = full.length - FINAL_LIMIT;
    const reducedMessageBudget = Math.max(500, MESSAGE_LIMIT - overhead - 100); // Leave 100 char margin
    messageContent = escapeHtmlLimited(m.message, reducedMessageBudget);

    // Rebuild without console errors first
    const fallbackLines = [title, '', messageContent, ''];
    if (m.email) fallbackLines.push(`✉️ ${escapeHtmlLimited(m.email, 254)}`);
    fallbackLines.push(`🔗 ${escapeHtmlLimited(m.metadata.url, 300)}`);
    fallbackLines.push(`🖥 ${escapeHtml(environmentLine(m))}`);
    fallbackLines.push('', link);
    full = fallbackLines.join('\n');

    // If still too long, drop email and further reduce message
    if (full.length > FINAL_LIMIT) {
      const finalBudget = Math.max(300, MESSAGE_LIMIT - (full.length - FINAL_LIMIT) - 150);
      messageContent = escapeHtmlLimited(m.message, finalBudget);
      const minimalLines = [
        title,
        '',
        messageContent,
        '',
        `🔗 ${escapeHtmlLimited(m.metadata.url, 300)}`,
        '',
        link,
      ];
      full = minimalLines.join('\n');
    }
  }

  const short = `${title}\n${link}`;
  return { full, short };
}
