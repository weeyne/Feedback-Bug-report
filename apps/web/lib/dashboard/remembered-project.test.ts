import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lastOpenedProject,
  navProjectId,
  rememberedProjectCookie,
  routeProjectId,
} from './remembered-project';

const projectIds = ['p1', 'p2'];

describe('routeProjectId', () => {
  it('reads the project id from any project route', () => {
    expect(routeProjectId('/app/p/p1')).toBe('p1');
    expect(routeProjectId('/app/p/p1/feedback')).toBe('p1');
  });

  it('is null elsewhere', () => {
    expect(routeProjectId('/app/account')).toBeNull();
    expect(routeProjectId('/app/new')).toBeNull();
  });
});

describe('navProjectId', () => {
  it('prefers the route project over the remembered one', () => {
    expect(navProjectId({ pathname: '/app/p/p2/install', remembered: 'p1', projectIds })).toBe(
      'p2',
    );
  });

  it('falls back to the remembered project on the account and billing pages', () => {
    for (const pathname of ['/app/account', '/app/billing']) {
      expect(navProjectId({ pathname, remembered: 'p1', projectIds })).toBe('p1');
    }
  });

  it('ignores a remembered project that no longer exists, or is unset', () => {
    expect(navProjectId({ pathname: '/app/account', remembered: 'gone', projectIds })).toBeNull();
    expect(
      navProjectId({ pathname: '/app/account', remembered: undefined, projectIds }),
    ).toBeNull();
  });

  it('does not carry the remembered project to other pages', () => {
    expect(navProjectId({ pathname: '/app/new', remembered: 'p1', projectIds })).toBeNull();
  });
});

describe('rememberedProjectCookie', () => {
  it('is site-wide and lasts 30 days', () => {
    expect(rememberedProjectCookie('p1')).toBe(
      'bp_project=p1; path=/; max-age=2592000; samesite=lax',
    );
  });

  it('adds the secure flag on https', () => {
    expect(rememberedProjectCookie('p1', true)).toBe(
      'bp_project=p1; path=/; max-age=2592000; samesite=lax; secure',
    );
  });
});

describe('lastOpenedProject', () => {
  afterEach(() => lastOpenedProject.reset());

  it('is shared by every reader and notifies subscribers only on change', () => {
    const listener = vi.fn();
    const unsubscribe = lastOpenedProject.subscribe(listener);
    expect(lastOpenedProject.get()).toBeNull();
    lastOpenedProject.set('p1');
    lastOpenedProject.set('p1');
    expect(listener).toHaveBeenCalledTimes(1);
    lastOpenedProject.set('p2');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(lastOpenedProject.get()).toBe('p2');
    unsubscribe();
    lastOpenedProject.set('p1');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
