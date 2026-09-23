import { expect, test } from '@playwright/test';

test('trigger keeps its own styles despite hostile host CSS', async ({ page }) => {
  await page.goto('/dev/built.html');
  const trigger = page.locator('[data-bugping] .bp-trigger');
  await expect(trigger).toHaveText('Feedback');
  const style = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, position: cs.position, borderStyle: cs.borderTopStyle };
  });
  expect(style).toEqual({ fontSize: '14px', position: 'fixed', borderStyle: 'none' });
});

test('submits feedback with a screenshot to the API', async ({ page }) => {
  await page.goto('/dev/built.html');
  await page.locator('.bp-trigger').click();
  await expect(page.locator('.bp-thumb')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });
  const probe = await page.locator('#mask-probe').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, viewport: window.innerWidth };
  });
  expect(probe.w).toBeGreaterThan(20);
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
    (window as unknown as { Bugping: { open(t: string): void } }).Bugping.open('idea'),
  );
  await expect(page.locator('.bp-panel')).toBeVisible();
  await expect(page.locator('.bp-type[data-type="idea"]')).toHaveAttribute('aria-pressed', 'true');
});

type Rgb = [number, number, number];

const near = (actual: number[], expected: Rgb, tolerance = 16) =>
  actual.every((value, i) => Math.abs(value - expected[i]!) <= tolerance);

/** Submits feedback from the current page and returns sampled screenshot pixels. */
async function submitAndSample(
  page: import('@playwright/test').Page,
  points: Array<[number, number]>,
) {
  await page.locator('.bp-trigger').click();
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
