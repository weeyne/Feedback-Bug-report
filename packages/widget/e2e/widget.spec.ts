import { expect, test } from '@playwright/test';

test('trigger keeps its own styles despite hostile host CSS', async ({ page }) => {
  await page.goto('/dev/built.html');
  const trigger = page.locator('[data-bugping] .bp-trigger');
  await expect(trigger).toHaveAttribute('aria-label', 'Feedback');
  const style = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, borderTopStyle: cs.borderTopStyle, width: cs.width };
  });
  expect(style).toEqual({ position: 'fixed', borderTopStyle: 'none', width: '56px' });
});

test('desktop bug flow: capture, annotate and submit with a screenshot', async ({ page }) => {
  await page.goto('/dev/built.html');
  await page.locator('.bp-trigger').click();
  await page.locator('.bp-card[data-type="bug"]').click();
  await expect(page.locator('.bp-thumb')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });

  // The masked probe (text on a transparent background) exists and has a real size.
  const probe = await page.locator('#mask-probe').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, viewport: window.innerWidth };
  });
  expect(probe.w).toBeGreaterThan(20);

  // Open the annotation editor and draw a rectangle on its canvas.
  await page.locator('.bp-shot-annotate').click();
  const editor = page.locator('[data-bugping-annotate]');
  await expect(editor).toBeVisible();
  const canvas = editor.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const x1 = box.x + box.width * 0.3;
  const y1 = box.y + box.height * 0.3;
  const x2 = box.x + box.width * 0.6;
  const y2 = box.y + box.height * 0.6;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 });
  await page.mouse.move(x2, y2, { steps: 5 });
  await page.mouse.up();
  await editor.locator('.bp-annotate-done').click();
  await expect(editor).toHaveCount(0);

  await page.locator('.bp-message').fill('The pricing button does nothing');
  await page.waitForTimeout(2100); // the bot guard drops submissions faster than 2s
  await page.locator('.bp-send').click();
  await expect(page.locator('.bp-thanks')).toBeVisible();

  const last = await (await page.request.get('/__mock/last-submission')).json();
  expect(last.status).toBe(201);
  expect(last.payload.message).toBe('The pricing button does nothing');
  expect(last.payload.metadata.url).toContain('/dev/built.html');
  expect(['image/webp', 'image/jpeg']).toContain(last.screenshot.type);
  expect(last.screenshot.size).toBeGreaterThan(1000);

  // The masked probe (text on a transparent background) must be painted near-black.
  const darkShare = await page.evaluate(async (rect) => {
    const res = await fetch('/__mock/last-screenshot');
    const bitmap = await createImageBitmap(await res.blob());
    const scale = bitmap.width / rect.viewport;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    // Composite onto white like a viewer would: transparent pixels must not count as black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const inset = 2;
    const x = Math.ceil((rect.x + inset) * scale);
    const y = Math.ceil((rect.y + inset) * scale);
    const w = Math.floor((rect.w - 2 * inset) * scale);
    const h = Math.floor((rect.h - 2 * inset) * scale);
    const { data } = ctx.getImageData(x, y, w, h);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! < 40) dark++;
    }
    return dark / (data.length / 4);
  }, probe);
  expect(darkShare).toBeGreaterThanOrEqual(0.95);

  // The submitted screenshot carries the drawn rectangle: some pixels around where it was drawn
  // (a fraction of the canvas box, which maps 1:1 to the same fraction of the captured image) are
  // painted in the annotation color.
  const hasRedBorder = await page.evaluate(async () => {
    const res = await fetch('/__mock/last-screenshot');
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const x0 = Math.floor(0.25 * bitmap.width);
    const x1 = Math.floor(0.65 * bitmap.width);
    const y0 = Math.floor(0.25 * bitmap.height);
    const y1 = Math.floor(0.65 * bitmap.height);
    const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r > 200 && g < 90 && b < 90) return true;
    }
    return false;
  });
  expect(hasRedBorder).toBe(true);
});

test('paste flow: a clipboard image fills the screenshot block', async ({ page }) => {
  await page.goto('/dev/built.html');
  await page.locator('.bp-trigger').click();
  await page.locator('.bp-card[data-type="idea"]').click();
  await expect(page.locator('.bp-shot')).toHaveAttribute('data-state', 'empty');

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a84ff';
    ctx.fillRect(0, 0, 100, 100);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    );
    const file = new File([blob], 'clip.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const panel = document.querySelector('[data-bugping]')?.shadowRoot?.querySelector('.bp-panel');
    panel?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, cancelable: true }));
  });

  await expect(page.locator('.bp-thumb')).toHaveAttribute('data-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('.bp-message').fill('Dark mode would be great');
  await page.waitForTimeout(2100); // the bot guard drops submissions faster than 2s
  await page.locator('.bp-send').click();
  await expect(page.locator('.bp-thanks')).toBeVisible();

  const last = await (await page.request.get('/__mock/last-submission')).json();
  expect(last.status).toBe(201);
  expect(['image/webp', 'image/jpeg']).toContain(last.screenshot.type);
  expect(last.screenshot.size).toBeGreaterThan(0);
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('speed-dial opens the sheet for an idea report', async ({ page }) => {
    await page.goto('/dev/built.html');
    await page.locator('.bp-trigger').click();
    await page.locator('.bp-dial-item[data-type="idea"]').click();
    await expect(page.locator('.bp-panel.bp-sheet')).toBeVisible();
    await page.locator('.bp-message').fill('Add dark mode please');
    await page.waitForTimeout(2100); // the bot guard drops submissions faster than 2s
    await page.locator('.bp-send').click();
    await expect(page.locator('.bp-thanks')).toBeVisible();
  });
});

test('hidden trigger can be opened through window.Bugping', async ({ page }) => {
  await page.goto('/dev/built-hidden.html');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if (document.querySelector('[data-bugping]')) resolve();
        else window.addEventListener('bugping:ready', () => resolve(), { once: true });
      }),
  );
  await expect(page.locator('.bp-trigger')).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { Bugping: { open(t?: string): void } }).Bugping.open(),
  );
  await expect(page.locator('.bp-home')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { Bugping: { open(t?: string): void } }).Bugping.open('general'),
  );
  await expect(page.locator('.bp-form-title')).toContainText('Ask a question');
});

type Rgb = [number, number, number];

const near = (actual: number[], expected: Rgb, tolerance = 16) =>
  actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);

/** Opens the bug report (which auto-captures) and submits it, returning sampled screenshot pixels. */
async function submitAndSample(
  page: import('@playwright/test').Page,
  points: Array<[number, number]>,
) {
  await page.locator('.bp-trigger').click();
  await page.locator('.bp-card[data-type="bug"]').click();
  await expect(page.locator('.bp-thumb')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });
  await page.locator('.bp-message').fill('Capture check');
  await page.waitForTimeout(2100);
  await page.locator('.bp-send').click();
  await expect(page.locator('.bp-thanks')).toBeVisible();
  // points are fractions of the image size; pixels are composited over #123456 so transparency shows.
  return page.evaluate(async (pts) => {
    const res = await fetch('/__mock/last-screenshot');
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: pts.map(([fx, fy]) =>
        Array.from(
          ctx
            .getImageData(
              Math.floor(fx * (bitmap.width - 1)),
              Math.floor(fy * (bitmap.height - 1)),
              1,
              1,
            )
            .data.slice(0, 3),
        ),
      ),
    };
  }, points);
}

test('captures exactly the viewport of a scrolled page, including fixed elements', async ({
  page,
}) => {
  await page.goto('/dev/scrolled.html');
  await expect(page.locator('[data-bugping] .bp-trigger')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 2000));
  const viewport = page.viewportSize()!;
  const shot = await submitAndSample(page, [
    [0.5, 30 / viewport.height], // fixed header
    [0.25, 500 / viewport.height], // marker: document 2400px - scroll 2000px = viewport 400..600px
    [0.25, 250 / viewport.height], // plain white page
  ]);
  expect(Math.abs(shot.width / shot.height - viewport.width / viewport.height)).toBeLessThan(0.02);
  const [header, marker, white] = shot.pixels;
  expect(near(header!, [255, 0, 170])).toBe(true);
  expect(near(marker!, [0, 170, 255])).toBe(true);
  expect(near(white!, [255, 255, 255])).toBe(true);
});

test('fills a white background when the page has none', async ({ page }) => {
  await page.goto('/dev/transparent.html');
  await expect(page.locator('[data-bugping] .bp-trigger')).toBeVisible();
  const shot = await submitAndSample(page, [[0.3, 0.8]]);
  expect(near(shot.pixels[0]!, [255, 255, 255])).toBe(true);
});
