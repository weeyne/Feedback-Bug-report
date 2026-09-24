import { describe, expect, it } from 'vitest';
import { DEMO_MESSAGE } from './protocol';
import {
  appHost,
  canvasScale,
  classifyStageMessage,
  clockTime,
  dashboardSrc,
  SCENE_LABEL_KEY,
  sceneUrl,
} from './stage-model';

const ORIGIN = 'https://bugping.app';
const shop = { name: 'shop' };
const dashboard = { name: 'dashboard' };
const frames = { shop, dashboard };
const event = (source: unknown, data: unknown, origin = ORIGIN) => ({
  source: source as MessageEvent['source'],
  data,
  origin,
});

describe('canvasScale', () => {
  it('fits the 1280 px canvas into the container width', () => {
    expect(canvasScale(1280)).toBe(1);
    expect(canvasScale(640)).toBe(0.5);
    expect(canvasScale(358)).toBeCloseTo(0.2797, 4);
  });

  it('is 0 before the container has a width', () => {
    expect(canvasScale(0)).toBe(0);
    expect(canvasScale(-5)).toBe(0);
    expect(canvasScale(Number.NaN)).toBe(0);
  });
});

describe('scene chrome', () => {
  it('maps every scene to its label key and URL', () => {
    expect(SCENE_LABEL_KEY).toEqual({
      site: 'sceneSite',
      telegram: 'sceneTelegram',
      dashboard: 'sceneDashboard',
    });
    expect(sceneUrl('site', 'bugping.app')).toBe('shop.example.com/checkout');
    expect(sceneUrl('telegram', 'bugping.app')).toBe('Telegram');
    expect(sceneUrl('dashboard', 'bugping.app')).toBe('bugping.app');
  });

  it('shows only the host of the app URL', () => {
    expect(appHost('https://bugping.app')).toBe('bugping.app');
    expect(appHost('http://localhost:3400/')).toBe('localhost:3400');
    expect(appHost('not a url')).toBe('not a url');
  });

  it('formats clock time and the dashboard src', () => {
    expect(clockTime(new Date(2026, 8, 24, 9, 5))).toBe('09:05');
    expect(clockTime(new Date(2026, 8, 24, 21, 30))).toBe('21:30');
    expect(dashboardSrc('abc_-1')).toBe('/demo/dashboard?r=abc_-1');
  });
});

describe('classifyStageMessage', () => {
  it('accepts ready and submitted only from the current shop frame', () => {
    expect(classifyStageMessage(event(shop, { type: DEMO_MESSAGE.ready }), ORIGIN, frames)).toBe(
      'shop-ready',
    );
    const submitted = { type: DEMO_MESSAGE.submitted, payload: { message: 'x' }, screenshot: null };
    expect(classifyStageMessage(event(shop, submitted), ORIGIN, frames)).toBe('submitted');
    const withBlob = { ...submitted, screenshot: new Blob(['x']) };
    expect(classifyStageMessage(event(shop, withBlob), ORIGIN, frames)).toBe('submitted');
    // From the dashboard frame, a stale frame or nowhere: ignored.
    expect(classifyStageMessage(event(dashboard, submitted), ORIGIN, frames)).toBeNull();
    expect(classifyStageMessage(event({}, { type: DEMO_MESSAGE.ready }), ORIGIN, frames)).toBe(
      null,
    );
    expect(classifyStageMessage(event(null, { type: DEMO_MESSAGE.ready }), ORIGIN, frames)).toBe(
      null,
    );
  });

  it('rejects other origins and malformed submissions', () => {
    const ready = { type: DEMO_MESSAGE.ready };
    expect(classifyStageMessage(event(shop, ready, 'https://evil.example'), ORIGIN, frames)).toBe(
      null,
    );
    const bad = [
      { type: DEMO_MESSAGE.submitted, screenshot: null },
      { type: DEMO_MESSAGE.submitted, payload: null, screenshot: null },
      { type: DEMO_MESSAGE.submitted, payload: {}, screenshot: 'data:image/png' },
      { type: DEMO_MESSAGE.submitted, payload: {} },
    ];
    for (const data of bad)
      expect(classifyStageMessage(event(shop, data), ORIGIN, frames)).toBe(null);
    expect(classifyStageMessage(event(shop, 'bugping-demo:ready'), ORIGIN, frames)).toBeNull();
  });

  it('accepts dashboard-ready only from the dashboard frame', () => {
    const ready = { type: DEMO_MESSAGE.dashboardReady };
    expect(classifyStageMessage(event(dashboard, ready), ORIGIN, frames)).toBe('dashboard-ready');
    expect(classifyStageMessage(event(shop, ready), ORIGIN, frames)).toBeNull();
    expect(
      classifyStageMessage(event(dashboard, ready), ORIGIN, { shop, dashboard: null }),
    ).toBeNull();
  });
});
