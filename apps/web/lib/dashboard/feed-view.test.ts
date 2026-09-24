import { describe, expect, it } from 'vitest';
import { feedEmptyKind, metaLine, replyHref } from './feed-view';

describe('metaLine', () => {
  it('joins page, browser and email with a middle dot', () => {
    expect(metaLine({ page: '/checkout', browser: 'Safari 18', email: 'anna@mail.com' })).toBe(
      '/checkout · Safari 18 · anna@mail.com',
    );
  });

  it('skips missing and blank parts', () => {
    expect(metaLine({ page: '/', browser: 'Chrome 131', email: null })).toBe('/ · Chrome 131');
    expect(metaLine({ page: null, browser: '  ', email: 'ivan@gmail.com' })).toBe('ivan@gmail.com');
    expect(metaLine({ page: null, browser: null, email: null })).toBe('');
  });
});

describe('feedEmptyKind', () => {
  it('is quiet when the project has no feedback at all, whatever the filters', () => {
    expect(feedEmptyKind({ hasFeedback: false, status: 'new' })).toBe('quiet');
    expect(feedEmptyKind({ hasFeedback: false, status: 'archived', type: 'bug' })).toBe('quiet');
  });

  it('points at the type filter first when one is set', () => {
    expect(feedEmptyKind({ hasFeedback: true, status: 'new', type: 'idea' })).toBe('noneOfType');
    expect(feedEmptyKind({ hasFeedback: true, status: 'resolved', type: 'bug' })).toBe(
      'noneOfType',
    );
  });

  it('maps each status tab to its own state', () => {
    expect(feedEmptyKind({ hasFeedback: true, status: 'new' })).toBe('caughtUp');
    expect(feedEmptyKind({ hasFeedback: true, status: 'resolved' })).toBe('noneResolved');
    expect(feedEmptyKind({ hasFeedback: true, status: 'archived' })).toBe('noneArchived');
  });
});

describe('replyHref', () => {
  it('builds a mailto link with an encoded subject', () => {
    expect(replyHref('anna@mail.com', 'Re: your feedback')).toBe(
      'mailto:anna@mail.com?subject=Re%3A%20your%20feedback',
    );
  });

  it('encodes characters that would add mailto parameters', () => {
    expect(replyHref('a&cc=x@mail.com', 'Hi')).toBe('mailto:a%26cc%3Dx@mail.com?subject=Hi');
  });
});
