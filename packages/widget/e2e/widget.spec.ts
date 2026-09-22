import { expect, test } from '@playwright/test';

test('trigger keeps its own styles despite hostile host CSS', async ({ page }) => {
  await page.goto('/dev/built.html');
  const trigger = page.locator('[data-dymcode] .dc-trigger');
  await expect(trigger).toHaveText('Feedback');
  const style = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, position: cs.position, borderStyle: cs.borderTopStyle };
  });
  expect(style).toEqual({ fontSize: '14px', position: 'fixed', borderStyle: 'none' });
});

test('submits feedback with a screenshot to the API', async ({ page }) => {
  await page.goto('/dev/built.html');
  await page.locator('.dc-trigger').click();
  await expect(page.locator('.dc-thumb')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  });
  const probe = await page.locator('#mask-probe').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, viewport: window.innerWidth };
  });
  expect(probe.w).toBeGreaterThan(20);
  await page.locator('.dc-message').fill('The pricing button does nothing');
  await page.waitForTimeout(2100); // the bot guard drops submissions faster than 2s
  await page.locator('.dc-send').click();
  await expect(page.locator('.dc-thanks')).toBeVisible();

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

test('hidden trigger can be opened through window.Dymcode', async ({ page }) => {
  await page.goto('/dev/built-hidden.html');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if (document.querySelector('[data-dymcode]')) resolve();
        else window.addEventListener('dymcode:ready', () => resolve(), { once: true });
      }),
  );
  await expect(page.locator('.dc-trigger')).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { Dymcode: { open(t: string): void } }).Dymcode.open('idea'),
  );
  await expect(page.locator('.dc-panel')).toBeVisible();
  await expect(page.locator('.dc-type[data-type="idea"]')).toHaveAttribute('aria-pressed', 'true');
});
