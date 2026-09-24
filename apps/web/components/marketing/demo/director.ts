import { DEMO_SELECTORS } from '@bugping/widget/demo-selectors';
import type { AppLocale } from '@/i18n/locale';
import { DEMO_PAY_ID, DEMO_TEXT } from './protocol';
import type { SubmittedMessage } from './shop-bridge';

/**
 * The landing demo's director: drives the real widget inside the /demo/shop iframe with real DOM
 * events (spec §2.2), moves the stage's drawn cursor to every target first, then walks the stage
 * through the Telegram and dashboard scenes (§2.5) and loops. Plain TS over an injected clock and
 * a `stage` adapter, so it is unit tested without a DOM.
 */

export type DemoScene = 'site' | 'telegram' | 'dashboard';
export type DirectorState = 'idle' | 'running' | 'paused' | 'stopped' | 'failed';

/** How long the drawn cursor takes to glide to a target (the stage animates over `ms`). */
export const CURSOR_MOVE_MS = 450;
/** Per-character typing interval. */
export const TYPE_MS = 45;
/** How often a wait re-checks for its target. */
export const POLL_MS = 100;
/** A step whose target does not appear within this time stops the demo (spec §2.2). */
export const STEP_TIMEOUT_MS = 3000;
/**
 * Waits on real work rather than on a target to appear — the screenshot capture, loading and
 * decoding for the editor, exporting the annotated image — get a longer bound: on a slow
 * machine they legitimately take more than 3 s.
 */
export const PROCESS_TIMEOUT_MS = 10_000;
/** How long after "Thanks" the stage may take to deliver the submitted report. */
export const SUBMIT_TIMEOUT_MS = 3000;
/** How long the dashboard iframe may take to report ready (counted from the report). */
export const DASHBOARD_TIMEOUT_MS = 8000;
/** How long `stage.reset()` may take to reload the iframes for the next loop. */
export const RESET_TIMEOUT_MS = 10_000;
/** Scene cross-fade; the stage animates it, the director only exports the value. */
export const FADE_MS = 500;
/** The drag around the Pay button: duration and number of pointermove steps. */
export const DRAG_MS = 600;
export const DRAG_STEPS = 12;
/** Space kept around the Pay button inside the drawn rectangle, in page CSS px. */
export const DRAG_PADDING = 10;

/**
 * Scene durations (§2.5). `site` is a target: the thanks screen is held until scene 1 has lasted
 * that long (never shorter than `PAUSE_MS.thanks`). `telegram` and `dashboard` count from the
 * scene switch, cross-fade included.
 */
export const SCENE_MS = Object.freeze({ site: 12_000, telegram: 3500, dashboard: 4000 });

/** Pauses between the steps of scene 1, so a viewer can follow each one. */
export const PAUSE_MS = Object.freeze({
  /** The store is visible before the cursor starts moving. */
  start: 500,
  /** Between the cursor arriving (press ripple) and the click landing. */
  press: 100,
  /** The home screen is visible before choosing "Report a bug". */
  home: 400,
  /** The fresh capture is visible before "Edit". */
  shot: 500,
  /** The editor is visible before choosing the rectangle tool. */
  editor: 300,
  /** Between choosing the tool and starting the drag. */
  tool: 200,
  /** The drawn rectangle is visible before "Done". */
  drawn: 500,
  /** The annotated thumbnail is visible before typing. */
  annotated: 400,
  /** The typed message is visible before "Send". */
  typed: 300,
  /** Minimum hold on the "Thanks" screen. */
  thanks: 800,
});

export interface DirectorClock {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const browserClock: DirectorClock = {
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => performance.now(),
};

/** What the demo stage (demo-stage.tsx) implements for the director. */
export interface DirectorStage {
  /** Glide the drawn cursor to (x, y) in the shop iframe's CSS px over `ms`. */
  moveCursor(x: number, y: number, ms: number): void;
  /** The click ripple under the cursor. */
  press(): void;
  /** Cross-fade to `scene` (FADE_MS). */
  showScene(scene: DemoScene): void;
  /**
   * Resolves with the next `bugping-demo:submitted` message from the shop. Called right before
   * Send is clicked, so the stage arms its listener for this loop; the stage keeps the report for
   * the Telegram scene.
   */
  waitSubmitted(): Promise<SubmittedMessage>;
  /**
   * Loads the dashboard iframe for `report` and resolves when it has reported ready and received
   * the screenshot. Called as soon as the report arrives (during the thanks/Telegram holds); the
   * director waits at most DASHBOARD_TIMEOUT_MS for it, then falls back.
   */
  prepareDashboard(report: SubmittedMessage): Promise<void>;
  /**
   * Fades out and reloads the iframes for the next loop; resolves when the shop has reported
   * ready (bounded by RESET_TIMEOUT_MS). The director then shows the `site` scene.
   */
  reset(): Promise<void> | void;
  /** Show the static frames: a step failed. Called once; the director stops for good. */
  fallback(): void;
  /** With `loop: false`: the single loop has finished on the dashboard scene. */
  done?(): void;
}

export interface DirectorOptions {
  /** The shop iframe's window (same origin), or null while it is not there. */
  frame(): Window | null;
  stage: DirectorStage;
  locale: AppLocale;
  /** Defaults to `browserClock`. */
  clock?: DirectorClock;
  /** Default true. False plays one loop, then calls `stage.done()`. */
  loop?: boolean;
}

export interface Director {
  /** Starts the timeline (only from `idle`). Call it once the shop iframe reported ready. */
  start(): void;
  pause(): void;
  resume(): void;
  /** Cancels everything, leaves no timers; safe to call repeatedly. */
  stop(): void;
  state(): DirectorState;
}

/** Unwinds the timeline after stop()/a failure; never escapes the director. */
class Cancelled extends Error {}

interface Task {
  remaining: number;
  due: number;
  handle: unknown;
  resolve(): void;
  reject(error: unknown): void;
}

/**
 * All waiting goes through here: timers only run while `running`, pause() remembers each timer's
 * remaining time and resume() re-arms it; stop() clears every timer and rejects its promise.
 */
function createScheduler(clock: DirectorClock) {
  const tasks = new Set<Task>();
  let running = false;
  let stopped = false;
  let resumers: Array<{ resolve(): void; reject(error: unknown): void }> = [];

  function arm(task: Task) {
    task.due = clock.now() + task.remaining;
    task.handle = clock.setTimeout(() => {
      tasks.delete(task);
      task.resolve();
    }, task.remaining);
  }

  return {
    /** Resolves after `ms` of running time. The returned `cancel` drops it without settling. */
    timer(ms: number): { promise: Promise<void>; cancel(): void } {
      if (stopped) return { promise: Promise.reject(new Cancelled()), cancel() {} };
      let task!: Task;
      const promise = new Promise<void>((resolve, reject) => {
        task = { remaining: Math.max(0, ms), due: 0, handle: null, resolve, reject };
      });
      tasks.add(task);
      if (running) arm(task);
      return {
        promise,
        cancel() {
          if (!tasks.delete(task)) return;
          if (task.handle !== null) clock.clearTimeout(task.handle);
        },
      };
    },
    sleep(ms: number): Promise<void> {
      return this.timer(ms).promise;
    },
    /** Resolves now when running, on resume() when paused; rejects once stopped. */
    whenRunning(): Promise<void> {
      if (stopped) return Promise.reject(new Cancelled());
      if (running) return Promise.resolve();
      return new Promise((resolve, reject) => resumers.push({ resolve, reject }));
    },
    run() {
      if (stopped || running) return;
      running = true;
      for (const task of tasks) arm(task);
      const waiting = resumers;
      resumers = [];
      for (const r of waiting) r.resolve();
    },
    hold() {
      if (stopped || !running) return;
      running = false;
      const now = clock.now();
      for (const task of tasks) {
        if (task.handle === null) continue;
        clock.clearTimeout(task.handle);
        task.handle = null;
        task.remaining = Math.max(0, task.due - now);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      running = false;
      for (const task of tasks) {
        if (task.handle !== null) clock.clearTimeout(task.handle);
        task.reject(new Cancelled());
      }
      tasks.clear();
      for (const r of resumers) r.reject(new Cancelled());
      resumers = [];
    },
  };
}

type Outcome<T> =
  { kind: 'ok'; value: T } | { kind: 'error'; error: unknown } | { kind: 'timeout' };

type FrameWindow = Window & typeof globalThis;
type Root = Pick<ParentNode, 'querySelector'>;

export function createDirector(options: DirectorOptions): Director {
  const { stage, locale } = options;
  const clock = options.clock ?? browserClock;
  const loop = options.loop ?? true;
  const scheduler = createScheduler(clock);
  let state: DirectorState = 'idle';
  /** Running time (pauses excluded), for the scene-1 target length. */
  let activeMs = 0;
  let activeSince = 0;

  const elapsed = () => activeMs + (state === 'running' ? clock.now() - activeSince : 0);

  function fail(reason: string): never {
    if (state !== 'failed' && state !== 'stopped') {
      state = 'failed';
      scheduler.stop();
      console.warn(`[demo] ${reason}; showing the static frames`);
      try {
        stage.fallback();
      } catch {
        // the stage's own concern; the director is already stopped
      }
    }
    throw new Cancelled();
  }

  function win(): FrameWindow | null {
    return options.frame() as FrameWindow | null;
  }

  function shadowOf(selector: string): Root | null {
    return win()?.document.querySelector(selector)?.shadowRoot ?? null;
  }
  const widget = () => shadowOf(DEMO_SELECTORS.host);
  const editor = () => shadowOf(DEMO_SELECTORS.editorHost);

  /** Polls `find` every POLL_MS (running time only) until it returns an element, up to `timeout`. */
  async function waitFor<T>(find: () => T | null, what: string, timeout = STEP_TIMEOUT_MS) {
    for (let waited = 0; ; waited += POLL_MS) {
      const found = find();
      if (found) return found;
      if (waited >= timeout) fail(`${what} did not appear within ${timeout} ms`);
      await scheduler.sleep(POLL_MS);
    }
  }

  const inRoot = (root: () => Root | null, selector: string) => () =>
    (root()?.querySelector(selector) as HTMLElement | null | undefined) ?? null;

  /**
   * Races a stage promise against `timeout` of running time. The outcome promise is marked handled
   * (a stop() rejects it with Cancelled), so it may be awaited later.
   */
  function bounded<T>(promise: Promise<T>, timeout: number): Promise<Outcome<T>> {
    const timer = scheduler.timer(timeout);
    const outcome = Promise.race([
      promise.then(
        (value): Outcome<T> => ({ kind: 'ok', value }),
        (error: unknown): Outcome<T> => ({ kind: 'error', error }),
      ),
      timer.promise.then((): Outcome<T> => ({ kind: 'timeout' })),
    ]).finally(() => timer.cancel());
    outcome.catch(() => undefined);
    return outcome;
  }

  /** Awaits a bounded outcome; continues only while running; fails on an error or timeout. */
  async function settle<T>(outcome: Promise<Outcome<T>>, what: string): Promise<T> {
    const result = await outcome;
    await scheduler.whenRunning();
    if (result.kind === 'timeout') fail(`${what} took too long`);
    if (result.kind === 'error') fail(`${what} failed: ${String(result.error)}`);
    return result.value;
  }

  function centre(el: Element): { x: number; y: number } {
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  async function pointAt(el: Element) {
    const { x, y } = centre(el);
    stage.moveCursor(x, y, CURSOR_MOVE_MS);
    await scheduler.sleep(CURSOR_MOVE_MS);
    stage.press();
    await scheduler.sleep(PAUSE_MS.press);
  }

  async function click(el: HTMLElement) {
    await pointAt(el);
    el.click();
  }

  /** Step 3's drag: a rectangle around the Pay button, drawn on the editor canvas. */
  async function drawAroundPay(canvas: HTMLElement) {
    const frame = win();
    const pay = frame?.document.querySelector(`#${DEMO_PAY_ID}`);
    if (!frame || !pay) fail(`#${DEMO_PAY_ID} is missing`);
    // The screenshot is the shop's viewport (screenshot.ts), shown whole on the canvas: map
    // viewport coordinates onto the canvas box.
    const box = canvas.getBoundingClientRect();
    const target = pay.getBoundingClientRect();
    const sx = box.width / frame.innerWidth;
    const sy = box.height / frame.innerHeight;
    const clampX = (x: number) => Math.min(box.left + box.width, Math.max(box.left, x));
    const clampY = (y: number) => Math.min(box.top + box.height, Math.max(box.top, y));
    const from = {
      x: clampX(box.left + (target.left - DRAG_PADDING) * sx),
      y: clampY(box.top + (target.top - DRAG_PADDING) * sy),
    };
    const to = {
      x: clampX(box.left + (target.right + DRAG_PADDING) * sx),
      y: clampY(box.top + (target.bottom + DRAG_PADDING) * sy),
    };

    const pointer = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(
        new frame.PointerEvent(type, {
          bubbles: true,
          composed: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );

    stage.moveCursor(from.x, from.y, CURSOR_MOVE_MS);
    await scheduler.sleep(CURSOR_MOVE_MS);
    stage.press();
    pointer('pointerdown', from.x, from.y);
    const stepMs = DRAG_MS / DRAG_STEPS;
    for (let i = 1; i <= DRAG_STEPS; i++) {
      await scheduler.sleep(stepMs);
      const x = from.x + ((to.x - from.x) * i) / DRAG_STEPS;
      const y = from.y + ((to.y - from.y) * i) / DRAG_STEPS;
      stage.moveCursor(x, y, stepMs);
      pointer('pointermove', x, y);
    }
    pointer('pointerup', to.x, to.y);
  }

  async function type(textarea: HTMLTextAreaElement, text: string) {
    const frame = win();
    if (!frame) fail('the shop frame is gone');
    await pointAt(textarea);
    for (const ch of text) {
      // The iframe is inert, so focus is not guaranteed: write the value and fire the input event.
      textarea.value += ch;
      textarea.dispatchEvent(
        new frame.InputEvent('input', {
          bubbles: true,
          composed: true,
          data: ch,
          inputType: 'insertText',
        }),
      );
      await scheduler.sleep(TYPE_MS);
    }
  }

  /**
   * Scene 1 (§2.2) on the real widget. Resolves with the dashboard's bounded readiness: the stage
   * starts loading it as soon as the report arrives, while the thanks and Telegram scenes play.
   */
  async function playSite(): Promise<{ dashboard: Promise<Outcome<void>> }> {
    const started = elapsed();
    await scheduler.sleep(PAUSE_MS.start);

    // 1. Launcher → home screen.
    await click(await waitFor(inRoot(widget, DEMO_SELECTORS.launcher), 'the launcher'));
    await scheduler.sleep(PAUSE_MS.home);

    // 2. "Report a bug" → the form; the real auto-capture runs.
    await click(await waitFor(inRoot(widget, DEMO_SELECTORS.bugCard), 'the bug card'));
    const shot = await waitFor(
      inRoot(widget, DEMO_SELECTORS.thumbReady),
      'the screenshot',
      PROCESS_TIMEOUT_MS,
    );
    await scheduler.sleep(PAUSE_MS.shot);

    // 3. Edit → the real editor; rectangle tool; drag around the Pay button.
    await click(await waitFor(inRoot(widget, DEMO_SELECTORS.annotate), 'the Edit button'));
    const canvas = await waitFor(
      inRoot(editor, DEMO_SELECTORS.editorCanvas),
      'the editor',
      PROCESS_TIMEOUT_MS,
    );
    await scheduler.sleep(PAUSE_MS.editor);
    await click(await waitFor(inRoot(editor, DEMO_SELECTORS.editorRectTool), 'the rectangle tool'));
    await scheduler.sleep(PAUSE_MS.tool);
    await drawAroundPay(canvas);
    await scheduler.sleep(PAUSE_MS.drawn);

    // 4. Done → back to the form with the annotated thumbnail (a new one: the old stays "ready").
    await click(await waitFor(inRoot(editor, DEMO_SELECTORS.editorDone), 'the Done button'));
    await waitFor(
      () => {
        if (editor()) return null;
        const thumb = inRoot(widget, DEMO_SELECTORS.thumbReady)();
        return thumb && thumb !== shot ? thumb : null;
      },
      'the annotated screenshot',
      PROCESS_TIMEOUT_MS,
    );
    await scheduler.sleep(PAUSE_MS.annotated);

    // 5. Type the message.
    const message = await waitFor(inRoot(widget, DEMO_SELECTORS.message), 'the message field');
    await type(message as HTMLTextAreaElement, DEMO_TEXT[locale]);
    await scheduler.sleep(PAUSE_MS.typed);

    // 6. Send → the real "Thanks" screen.
    const send = await waitFor(inRoot(widget, DEMO_SELECTORS.send), 'the Send button');
    await pointAt(send);
    const submitted = stage.waitSubmitted();
    send.click();
    await waitFor(inRoot(widget, DEMO_SELECTORS.thanks), 'the thanks screen');
    const report = await settle(bounded(submitted, SUBMIT_TIMEOUT_MS), 'the submitted report');
    const dashboard = bounded(stage.prepareDashboard(report), DASHBOARD_TIMEOUT_MS);
    await scheduler.sleep(Math.max(PAUSE_MS.thanks, SCENE_MS.site - (elapsed() - started)));
    // Wrapped: an async function returning a promise would wait for it.
    return { dashboard };
  }

  /** Scenes 2 and 3 (§2.3, §2.4, §2.5). */
  async function playScenes(dashboard: Promise<Outcome<void>>) {
    stage.showScene('telegram');
    await scheduler.sleep(SCENE_MS.telegram);
    await settle(dashboard, 'the dashboard');
    stage.showScene('dashboard');
    await scheduler.sleep(SCENE_MS.dashboard);
  }

  async function play() {
    stage.showScene('site');
    for (;;) {
      await playScenes((await playSite()).dashboard);
      if (!loop) {
        state = 'stopped';
        scheduler.stop();
        stage.done?.();
        return;
      }
      await settle(bounded(Promise.resolve(stage.reset()), RESET_TIMEOUT_MS), 'the reset');
      stage.showScene('site');
    }
  }

  return {
    start() {
      if (state !== 'idle') return;
      state = 'running';
      activeSince = clock.now();
      scheduler.run();
      play().catch((error: unknown) => {
        if (error instanceof Cancelled) return;
        try {
          fail(`unexpected error: ${String(error)}`);
        } catch {
          // Cancelled: already reported
        }
      });
    },
    pause() {
      if (state !== 'running') return;
      activeMs += clock.now() - activeSince;
      state = 'paused';
      scheduler.hold();
    },
    resume() {
      if (state !== 'paused') return;
      state = 'running';
      activeSince = clock.now();
      scheduler.run();
    },
    stop() {
      if (state === 'stopped' || state === 'failed') return;
      state = 'stopped';
      scheduler.stop();
    },
    state: () => state,
  };
}
