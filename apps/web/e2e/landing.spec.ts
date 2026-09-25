import { expect, test, type Page } from '@playwright/test';

/**
 * The landing (spec 2026-09-24-landing-redesign §6): sections, anchors, CTAs, theme, the live
 * demo, the mobile menu, the login page's theme toggle and noindex on /demo/*.
 */

/** The header's own toggle; the footer (and the open mobile sheet) render more of them. */
const headerToggle = (page: Page) => page.getByTestId('landing-header').getByTestId('theme-toggle');

async function expectDarkAfterToggle(page: Page, toggle: ReturnType<Page['getByTestId']>) {
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/\bdark\b/);
  await toggle.click();
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/);
}

/** Pathnames of every `/api/` request the page or any of its frames makes. */
function recordApiRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/')) hits.push(pathname);
  });
  return hits;
}

/**
 * Records, in the top document, every distinct `data-scene` the visible demo scene takes, in
 * order (`window.__demoScenes`). Scenes last seconds; a 50 ms sample cannot miss one.
 */
async function recordScenes(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const seen: string[] = [];
    (window as unknown as { __demoScenes: string[] }).__demoScenes = seen;
    setInterval(() => {
      const scene = document
        .querySelector('[data-testid="demo-scene"]')
        ?.getAttribute('data-scene');
      if (scene && seen.at(-1) !== scene) seen.push(scene);
    }, 50);
  });
  return () => page.evaluate(() => (window as unknown as { __demoScenes: string[] }).__demoScenes);
}

/** The first dev compile of the demo iframes' routes can take a while; do it outside the clock. */
async function warmDemoRoutes(page: Page) {
  for (const path of ['/demo/shop', '/demo/dashboard']) {
    const response = await page.request.get(path, { timeout: 60_000 });
    expect(response.ok()).toBe(true);
  }
}

test.describe('landing', () => {
  test('all sections are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('landing-demo')).toBeAttached();
    await expect(page.locator('section#features')).toBeAttached();
    await expect(page.locator('section#how')).toBeAttached();
    await expect(page.locator('section#pricing[data-testid="landing-pricing"]')).toBeAttached();
    await expect(page.locator('section#faq[data-testid="landing-faq"]')).toBeAttached();
    await expect(page.locator('section[aria-labelledby="cta-title"]')).toBeAttached();
    await expect(page.locator('footer')).toBeAttached();
    await expect(page.getByTestId('landing-faq').locator('details')).not.toHaveCount(0);
  });

  test('header nav anchors scroll to their sections', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByTestId('landing-header').getByRole('navigation');
    for (const [label, id] of [
      ['Features', 'features'],
      ['Pricing', 'pricing'],
      ['FAQ', 'faq'],
    ] as const) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      // Smooth scrolling: wait until the section rests under the sticky header (scroll-margin 5rem).
      await expect
        .poll(
          () =>
            page.evaluate((target) => {
              const top = document.getElementById(target)!.getBoundingClientRect().top;
              return top >= 0 && top <= 100;
            }, id),
          { timeout: 5000 },
        )
        .toBe(true);
    }
  });

  test('CTAs link to sign-up and billing', async ({ page }) => {
    await page.goto('/');
    const header = page.getByTestId('landing-header');
    await expect(header.getByRole('link', { name: 'Start free', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(header.getByRole('link', { name: 'Log in', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByTestId('landing-cta')).toHaveAttribute('href', '/login');
    await expect(page.getByTestId('landing-pricing-cta')).toHaveAttribute('href', '/app/billing');
    const pricing = page.getByTestId('landing-pricing');
    await expect(pricing.getByRole('link', { name: 'Start free', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(
      page.locator('section[aria-labelledby="cta-title"]').getByRole('link'),
    ).toHaveAttribute('href', '/login');

    await page.getByTestId('landing-cta').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the theme toggle switches to dark and persists', async ({ page }) => {
    await page.goto('/');
    await expectDarkAfterToggle(page, headerToggle(page));
    await expect(headerToggle(page)).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('landing demo', () => {
  test('plays through telegram to the dashboard without any API request', async ({ page }) => {
    test.setTimeout(90_000);
    await warmDemoRoutes(page);
    const apiRequests = recordApiRequests(page);
    const scenes = await recordScenes(page);

    await page.goto('/');
    await page.getByTestId('landing-demo').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-testid="demo-scene"][data-scene="site"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('[data-testid="demo-scene"][data-scene="dashboard"]')).toBeVisible({
      timeout: 30_000,
    });

    const order = await scenes();
    expect(order.slice(0, 3)).toEqual(['site', 'telegram', 'dashboard']);
    expect(apiRequests).toEqual([]);
  });

  test('reduced motion shows static frames and plays one loop on request', async ({ page }) => {
    test.setTimeout(90_000);
    await warmDemoRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const apiRequests = recordApiRequests(page);

    await page.goto('/');
    await page.getByTestId('landing-demo').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('demo-static')).toBeVisible({ timeout: 30_000 });
    const play = page.getByTestId('demo-play');
    await expect(play).toBeVisible();
    await expect(page.getByTestId('demo-scene')).toHaveCount(0);

    await play.click();
    await expect(page.getByTestId('demo-static')).toHaveCount(0);
    await expect(page.locator('[data-testid="demo-scene"][data-scene="dashboard"]')).toBeVisible({
      timeout: 30_000,
    });
    // One loop only: the final scene stays and the button comes back to replay.
    await expect(play).toBeVisible();
    await expect(page.locator('[data-testid="demo-scene"][data-scene="dashboard"]')).toBeVisible();
    expect(apiRequests).toEqual([]);
  });
});

test.describe('mobile 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectNoHorizontalOverflow(page: Page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  }

  test('the menu opens with the nav links and a theme toggle', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-header').getByRole('navigation')).toBeHidden();
    await page.getByTestId('landing-menu').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const label of ['Features', 'How it works', 'Pricing', 'FAQ', 'Log in']) {
      await expect(dialog.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    await expect(dialog.getByTestId('theme-toggle')).toBeVisible();

    await dialog.getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#pricing$/);
  });

  test('no horizontal overflow on the landing and the login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-menu')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Reveal-on-scroll content and the lazy demo are in their final layout at the bottom.
    await page.locator('footer').scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);

    await page.goto('/login');
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test('the login page has a working theme toggle', async ({ page }) => {
  await page.goto('/login');
  await expectDarkAfterToggle(page, page.getByTestId('theme-toggle'));
});

test('demo pages are not indexed', async ({ page }) => {
  for (const path of ['/demo/shop', '/demo/dashboard']) {
    await page.goto(path);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
    await expect(robots).toHaveAttribute('content', /nofollow/);
  }
});
