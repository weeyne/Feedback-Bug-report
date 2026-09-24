import type { SubmitPayload } from '@bugping/shared';
import { DEMO_SELECTORS } from '@bugping/widget/demo-selectors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDirector,
  DRAG_STEPS,
  POLL_MS,
  SCENE_MS,
  STEP_TIMEOUT_MS,
  type Director,
  type DirectorClock,
  type DirectorStage,
} from './director';
import { DEMO_MESSAGE, DEMO_PAY_ID, DEMO_TEXT } from './protocol';
import type { SubmittedMessage } from './shop-bridge';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

class FakeEvent {
  constructor(
    readonly type: string,
    readonly init: Record<string, unknown> = {},
  ) {}
}

/** Just what the director touches: rect, click, dispatchEvent, value, shadowRoot. */
class FakeElement {
  value = '';
  shadowRoot: FakeRoot | null = null;
  events: FakeEvent[] = [];
  constructor(
    readonly name: string,
    private readonly box: Box,
    private readonly onClick: () => void = () => {},
  ) {}
  getBoundingClientRect() {
    const { left, top, width, height } = this.box;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  click() {
    log.push(`click:${this.name}`);
    this.onClick();
  }
  dispatchEvent(event: FakeEvent) {
    this.events.push(event);
    return true;
  }
}

class FakeRoot {
  constructor(private readonly find: (selector: string) => FakeElement | null) {}
  querySelector(selector: string) {
    return this.find(selector);
  }
}

let log: string[] = [];

const CAPTURE_MS = 1500;
const EDITOR_OPEN_MS = 200;
const EXPORT_MS = 150;
const SUBMIT_MS = 600;
const VIEWPORT = { w: 1280, h: 720 };
const CANVAS: Box = { left: 100, top: 50, width: 640, height: 360 };
const PAY: Box = { left: 900, top: 500, width: 200, height: 48 };

/** A fake /demo/shop: the widget's screens as a small state machine over the fake timers. */
function createShop(options: { missing?: string; captureMs?: number } = {}) {
  let screen: 'closed' | 'home' | 'form' | 'thanks' = 'closed';
  let thumb: FakeElement | null = null;
  let editorOpen = false;
  let submitted: (message: SubmittedMessage) => void = () => {};
  const box = (left: number, top: number): Box => ({ left, top, width: 40, height: 20 });

  const launcher = new FakeElement('launcher', box(1220, 660), () => {
    screen = 'home';
  });
  const bugCard = new FakeElement('bugCard', box(1000, 300), () => {
    screen = 'form';
    thumb = null;
    setTimeout(
      () => (thumb = new FakeElement('thumb', box(1000, 200))),
      options.captureMs ?? CAPTURE_MS,
    );
  });
  const annotate = new FakeElement('annotate', box(1000, 260), () => {
    setTimeout(() => (editorOpen = true), EDITOR_OPEN_MS);
  });
  const message = new FakeElement('message', box(1000, 400));
  const send = new FakeElement('send', box(1000, 600), () => {
    setTimeout(() => {
      submitted({
        type: DEMO_MESSAGE.submitted,
        payload: { message: message.value } as unknown as SubmitPayload,
        screenshot: null,
      });
      screen = 'thanks';
    }, SUBMIT_MS);
  });
  const thanks = new FakeElement('thanks', box(1000, 300));
  const rectTool = new FakeElement('rectTool', box(500, 680));
  const canvas = new FakeElement('canvas', CANVAS);
  const done = new FakeElement('done', box(700, 680), () => {
    editorOpen = false;
    thumb = null;
    setTimeout(() => (thumb = new FakeElement('annotatedThumb', box(1000, 200))), EXPORT_MS);
  });
  const pay = new FakeElement('pay', PAY);

  const widgetEls: Record<string, () => FakeElement | null> = {
    [DEMO_SELECTORS.launcher]: () => launcher,
    [DEMO_SELECTORS.bugCard]: () => (screen === 'home' ? bugCard : null),
    [DEMO_SELECTORS.thumbReady]: () => (screen === 'form' ? thumb : null),
    [DEMO_SELECTORS.annotate]: () => (screen === 'form' && thumb ? annotate : null),
    [DEMO_SELECTORS.message]: () => (screen === 'form' ? message : null),
    [DEMO_SELECTORS.send]: () => (screen === 'form' ? send : null),
    [DEMO_SELECTORS.thanks]: () => (screen === 'thanks' ? thanks : null),
  };
  const editorEls: Record<string, FakeElement> = {
    [DEMO_SELECTORS.editorRectTool]: rectTool,
    [DEMO_SELECTORS.editorCanvas]: canvas,
    [DEMO_SELECTORS.editorDone]: done,
  };
  const pick = (selector: string, found: FakeElement | null | undefined) =>
    selector === options.missing ? null : (found ?? null);

  const host = new FakeElement('host', box(0, 0));
  host.shadowRoot = new FakeRoot((s) => pick(s, widgetEls[s]?.()));
  const editorHost = new FakeElement('editorHost', box(0, 0));
  editorHost.shadowRoot = new FakeRoot((s) => pick(s, editorEls[s]));

  const document = new FakeRoot((s) => {
    if (s === DEMO_SELECTORS.host) return host;
    if (s === DEMO_SELECTORS.editorHost) return editorOpen ? editorHost : null;
    if (s === `#${DEMO_PAY_ID}`) return pay;
    return null;
  });
  const frame = {
    document,
    innerWidth: VIEWPORT.w,
    innerHeight: VIEWPORT.h,
    PointerEvent: FakeEvent,
    InputEvent: FakeEvent,
  } as unknown as Window;

  return {
    frame,
    message,
    canvas,
    onSubmitted(handler: (message: SubmittedMessage) => void) {
      submitted = handler;
    },
    reload() {
      screen = 'closed';
      thumb = null;
      editorOpen = false;
      message.value = '';
      canvas.events = [];
    },
  };
}

function createStage(shop: ReturnType<typeof createShop>, dashboardMs = 2000) {
  const stage = {
    moveCursor: vi.fn((x: number, y: number) => void log.push(`move:${x},${y}`)),
    press: vi.fn(() => void log.push('press')),
    showScene: vi.fn((scene: string) => void log.push(`scene:${scene}`)),
    waitSubmitted: vi.fn(
      () =>
        new Promise<SubmittedMessage>((resolve) =>
          shop.onSubmitted((message) => {
            log.push(`submitted:${String(message.payload.message)}`);
            resolve(message);
          }),
        ),
    ),
    prepareDashboard: vi.fn(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            log.push('dashboard-ready');
            resolve();
          }, dashboardMs),
        ),
    ),
    reset: vi.fn(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            shop.reload();
            log.push('reset');
            resolve();
          }, 500),
        ),
    ),
    fallback: vi.fn(() => void log.push('fallback')),
    done: vi.fn(() => void log.push('done')),
  } satisfies DirectorStage;
  return stage;
}

const clock: DirectorClock = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

const actions = () =>
  log.filter((entry) => !entry.startsWith('move:') && entry !== 'press' && entry !== 'reset');

const ORDER = [
  'scene:site',
  'click:launcher',
  'click:bugCard',
  'click:annotate',
  'click:rectTool',
  'click:done',
  'click:send',
  `submitted:${DEMO_TEXT.en}`,
  'scene:telegram',
  'dashboard-ready',
  'scene:dashboard',
];

let director: Director | undefined;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  log = [];
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  director?.stop();
  director = undefined;
  vi.useRealTimers();
  warn.mockRestore();
});

/** Advances until `predicate` holds (at most `limit` ms of fake time). */
async function until(predicate: () => boolean, limit = 60_000) {
  for (let t = 0; t < limit && !predicate(); t += 50) await vi.advanceTimersByTimeAsync(50);
  expect(predicate()).toBe(true);
}

describe('demo director', () => {
  it('plays every step of scene 1 in order, then the Telegram and dashboard scenes', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en', loop: false });
    director.start();
    expect(director.state()).toBe('running');

    await until(() => stage.done.mock.calls.length > 0);
    expect(actions()).toEqual([...ORDER, 'done']);
    expect(director.state()).toBe('stopped');
    expect(vi.getTimerCount()).toBe(0);

    // Every click is preceded by the cursor gliding to the target's centre and a press.
    const launcherAt = log.indexOf('click:launcher');
    expect(log.slice(launcherAt - 2, launcherAt)).toEqual(['move:1240,670', 'press']);

    // The typed message, char by char through input events.
    expect(shop.message.value).toBe(DEMO_TEXT.en);
    const inputs = shop.message.events.filter((e) => e.type === 'input');
    expect(inputs.map((e) => e.init.data).join('')).toBe(DEMO_TEXT.en);
    expect(inputs[0]!.init).toMatchObject({
      bubbles: true,
      composed: true,
      inputType: 'insertText',
    });

    // The rectangle around the Pay button, mapped from the viewport onto the canvas (scale 0.5).
    const pointer = shop.canvas.events;
    expect(pointer.map((e) => e.type)).toEqual([
      'pointerdown',
      ...Array<string>(DRAG_STEPS).fill('pointermove'),
      'pointerup',
    ]);
    expect(pointer[0]!.init).toMatchObject({
      clientX: 100 + (900 - 10) * 0.5,
      clientY: 50 + (500 - 10) * 0.5,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons: 1,
      bubbles: true,
      composed: true,
    });
    expect(pointer.at(-1)!.init).toMatchObject({
      clientX: 100 + (1100 + 10) * 0.5,
      clientY: 50 + (548 + 10) * 0.5,
    });
    const { clientX, clientY } = pointer.at(-1)!.init;
    expect(pointer.at(-2)!.init).toMatchObject({ clientX, clientY, buttons: 1 });
    expect(pointer.at(-1)!.init).toMatchObject({ buttons: 0 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('types in the landing locale', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'ru', loop: false });
    director.start();
    await until(() => stage.done.mock.calls.length > 0);
    expect(shop.message.value).toBe(DEMO_TEXT.ru);
  });

  it('holds the scenes for their durations, scene 1 for its target length', async () => {
    const timeline = async (captureMs: number) => {
      log = [];
      const shop = createShop({ captureMs });
      const stage = createStage(shop);
      const at: Record<string, number> = {};
      stage.showScene.mockImplementation((scene: string) => void (at[scene] = Date.now()));
      stage.done.mockImplementation(() => void (at.done = Date.now()));
      const run = createDirector({
        frame: () => shop.frame,
        stage,
        clock,
        locale: 'en',
        loop: false,
      });
      run.start();
      await until(() => stage.done.mock.calls.length > 0);
      expect(at.dashboard! - at.telegram!).toBe(SCENE_MS.telegram);
      expect(at.done! - at.dashboard!).toBe(SCENE_MS.dashboard);
      return at.telegram! - at.site!;
    };
    // A quick capture: the thanks screen is held until scene 1 has lasted its target.
    expect(await timeline(300)).toBe(SCENE_MS.site);
    // A slow one: scene 1 runs longer, the thanks screen keeps its minimum hold.
    expect(await timeline(4000)).toBeGreaterThan(SCENE_MS.site);
  });

  it('makes no progress while paused and continues where it stopped', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en', loop: false });
    director.start();
    await until(() => shop.message.value.length >= 5);

    director.pause();
    expect(director.state()).toBe('paused');
    const typed = shop.message.value;
    const logged = log.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shop.message.value).toBe(typed);
    expect(log.length).toBe(logged);
    expect(vi.getTimerCount()).toBe(0);

    director.resume();
    expect(director.state()).toBe('running');
    await until(() => stage.done.mock.calls.length > 0);
    expect(shop.message.value).toBe(DEMO_TEXT.en);
    expect(actions()).toEqual([...ORDER, 'done']);
  });

  it('does not move on when a pending stage promise settles while paused', async () => {
    const shop = createShop();
    const stage = createStage(shop, 6000);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en', loop: false });
    director.start();
    await until(() => log.includes('scene:telegram'));
    director.pause();
    // The dashboard page gets ready on its own clock meanwhile.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(log).toContain('dashboard-ready');
    expect(log).not.toContain('scene:dashboard');
    director.resume();
    await until(() => stage.done.mock.calls.length > 0);
    expect(log.indexOf('scene:telegram')).toBeLessThan(log.indexOf('dashboard-ready'));
    expect(log.indexOf('dashboard-ready')).toBeLessThan(log.indexOf('scene:dashboard'));
    expect(stage.fallback).not.toHaveBeenCalled();
  });

  it('resets the stage after the loop and starts over from the launcher', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en' });
    director.start();
    await until(() => log.filter((a) => a === 'scene:dashboard').length === 2);

    const first = log.indexOf('scene:dashboard');
    const second = log.slice(first + 1);
    expect(second[0]).toBe('reset');
    expect(second.filter((a) => !a.startsWith('move:') && a !== 'press').slice(1)).toEqual([
      ...ORDER,
    ]);
    expect(stage.reset).toHaveBeenCalledTimes(1);
    expect(stage.done).not.toHaveBeenCalled();
    expect(director.state()).toBe('running');
  });

  it('falls back once and stops when a target is missing', async () => {
    const shop = createShop({ missing: DEMO_SELECTORS.editorRectTool });
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en' });
    director.start();
    await until(() => stage.fallback.mock.calls.length > 0);

    expect(director.state()).toBe('failed');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[demo\] the rectangle tool/);
    expect(vi.getTimerCount()).toBe(0);
    const logged = log.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log.length).toBe(logged);
    expect(actions()).toEqual([
      'scene:site',
      'click:launcher',
      'click:bugCard',
      'click:annotate',
      'fallback',
    ]);
    expect(stage.fallback).toHaveBeenCalledTimes(1);
  });

  it('gives up on a target after STEP_TIMEOUT_MS of polling', async () => {
    const stage = createStage(createShop());
    director = createDirector({ frame: () => null, stage, clock, locale: 'en' });
    director.start();
    await vi.advanceTimersByTimeAsync(STEP_TIMEOUT_MS);
    expect(stage.fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000 + POLL_MS);
    expect(stage.fallback).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when the dashboard never gets ready', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    stage.prepareDashboard.mockImplementation(() => new Promise<void>(() => {}));
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en' });
    director.start();
    await until(() => stage.fallback.mock.calls.length > 0);
    expect(log).toContain('scene:telegram');
    expect(log).not.toContain('scene:dashboard');
    expect(director.state()).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop cancels everything, leaves no timers and is safe to repeat', async () => {
    const shop = createShop();
    const stage = createStage(shop);
    director = createDirector({ frame: () => shop.frame, stage, clock, locale: 'en' });
    director.start();
    await until(() => log.includes('click:bugCard'));
    director.stop();
    director.stop();
    expect(director.state()).toBe('stopped');
    await vi.advanceTimersByTimeAsync(CAPTURE_MS); // let the fake widget's own capture finish
    expect(vi.getTimerCount()).toBe(0);
    const logged = log.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log.length).toBe(logged);
    expect(stage.fallback).not.toHaveBeenCalled();
    director.start();
    director.resume();
    expect(director.state()).toBe('stopped');
    expect(warn).not.toHaveBeenCalled();
  });
});
