import { expect, test, type Page } from '@playwright/test';

const REF_KEY = 'pk_AbCdEfGh12345678';
const RU_BROWSER = { 'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8' };

test.describe('public pages', () => {
  test('/ru pages render in Russian with <html lang="ru">', async ({ page }) => {
    await page.goto('/ru');
    await expect(page).toHaveURL(/\/ru$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Узнавайте о багах');

    await page.goto('/ru/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Установка Bugping на ваш сайт',
    );

    await page.goto('/ru/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle(/Политика конфиденциальности/);
  });

  test('unprefixed pages render in English with <html lang="en">', async ({ page }) => {
    for (const path of ['/', '/install', '/terms']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(path);
      await expect(page.locator('html'), path).toHaveAttribute('lang', 'en');
    }
    await expect(page.getByTestId('legal-operator')).toContainText('Dymko Artem Ruslanovych');
  });

  test('/en URLs redirect to the unprefixed English page', async ({ page }) => {
    await page.goto('/en/install');
    expect(new URL(page.url()).pathname).toBe('/install');
    await expect(page.getByTestId('install-guide-page')).toBeVisible();
  });

  test('unknown first segments are a 404, not a page with that locale', async ({ page }) => {
    for (const path of ['/de', '/de/install', '/ru/app', '/ru/login']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole('heading', { name: 'Page not found' }), path).toBeVisible();
    }
  });

  test('metadata routes are not captured by the locale segment', async ({ request }) => {
    for (const path of ['/sitemap.xml', '/robots.txt', '/icon.svg']) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
  });
});

test.describe('one-time language detection', () => {
  test.use({ locale: 'ru-RU' });

  test('a Russian browser without the cookie lands on the /ru page', async ({ page }) => {
    await page.goto('/install');
    expect(new URL(page.url()).pathname).toBe('/ru/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Установка Bugping на ваш сайт',
    );
  });

  test('the English cookie keeps the English page', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'locale', value: 'en', url: baseURL! }]);
    await page.goto('/install');
    expect(new URL(page.url()).pathname).toBe('/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Install Bugping on your site',
    );
  });

  test('the referral survives the redirect', async ({ page, context }) => {
    await page.goto(`/?ref=${REF_KEY}`);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/ru');
    expect(url.searchParams.get('ref')).toBe(REF_KEY);
    const ref = (await context.cookies()).find((c) => c.name === 'ref');
    expect(ref?.value).toBe(REF_KEY);
  });

  test('the dashboard, login and demo keep their URLs', async ({ page }) => {
    await page.goto('/login');
    expect(new URL(page.url()).pathname).toBe('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

    await page.goto('/demo/shop');
    expect(new URL(page.url()).pathname).toBe('/demo/shop');

    await page.goto('/app/billing');
    expect(new URL(page.url()).pathname).toBe('/login');
    const next = (await page.context().cookies()).find((c) => c.name === 'bp_next');
    expect(decodeURIComponent(next?.value ?? '')).toBe('/app/billing');
  });
});

test.describe('detection responses', () => {
  test('the redirect keeps the query string and sets the ref cookie', async ({ request }) => {
    const response = await request.get(`/?ref=${REF_KEY}`, {
      headers: RU_BROWSER,
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe('/ru');
    expect(response.headers()['location']).toContain(`ref=${REF_KEY}`);
    expect(response.headers()['set-cookie']).toContain(`ref=${REF_KEY}`);
  });

  test('the locale=ru cookie redirects an English URL to /ru', async ({ request }) => {
    const response = await request.get('/terms', {
      headers: { cookie: 'locale=ru' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe('/ru/terms');
  });

  test('opening a /ru page from an English browser stores the site-wide locale cookie', async ({
    request,
  }) => {
    const response = await request.get('/ru', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const cookie = response.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/locale=ru/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=31536000/);
  });

  test('crawlers without Russian in Accept-Language are never redirected', async ({ request }) => {
    const variants: Record<string, string>[] = [{}, { 'accept-language': 'en-US,en;q=0.9' }];
    for (const headers of variants) {
      const response = await request.get('/', { headers, maxRedirects: 0 });
      expect(response.status()).toBe(200);
    }
  });
});

/** The footer (switcher, page links) and the header's theme toggle (a client component). */
const footer = (page: Page) => page.locator('footer');
const headerToggle = (page: Page) => page.getByTestId('landing-header').getByTestId('theme-toggle');

test.describe('locale switcher', () => {
  test('moves /install to /ru/install and back, re-rendering the whole document', async ({
    page,
    context,
  }) => {
    await page.goto('/install?utm_source=e2e');
    await expect(headerToggle(page)).toHaveAccessibleName('Dark theme');

    await footer(page).getByTestId('locale-switcher').selectOption('ru');
    await expect(page).toHaveURL(/\/ru\/install\?utm_source=e2e$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Установка Bugping на ваш сайт',
    );
    await expect(headerToggle(page)).toHaveAccessibleName('Тёмная тема');
    await expect(footer(page).getByText('Язык', { exact: true })).toBeVisible();
    await expect(footer(page).getByTestId('locale-switcher')).toHaveValue('ru');
    expect((await context.cookies()).find((c) => c.name === 'locale')?.value).toBe('ru');

    await footer(page).getByTestId('locale-switcher').selectOption('en');
    await expect(page).toHaveURL(/\/install\?utm_source=e2e$/);
    expect(new URL(page.url()).pathname).toBe('/install');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Install Bugping on your site',
    );
    await expect(headerToggle(page)).toHaveAccessibleName('Dark theme');
    await expect(footer(page).getByText('Language', { exact: true })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'locale')?.value).toBe('en');

    // The chosen English sticks: an English URL is not redirected to /ru any more.
    await page.goto('/terms');
    expect(new URL(page.url()).pathname).toBe('/terms');
  });
});

test.describe('localized links', () => {
  test('/ru pages link to /ru pages; login and the dashboard keep their URLs', async ({ page }) => {
    await page.goto('/ru/privacy');
    const header = page.getByTestId('landing-header');
    const nav = header.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Цены', exact: true })).toHaveAttribute(
      'href',
      '/ru#pricing',
    );
    await expect(header.getByRole('link').first()).toHaveAttribute('href', '/ru');
    await expect(header.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );

    const links = footer(page).getByRole('navigation').getByRole('link');
    await expect(links).toHaveCount(6);
    const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual([
      '/ru#pricing',
      '/ru/install',
      '/login',
      '/ru/privacy',
      '/ru/terms',
      '/ru/refund',
    ]);

    await page.goto('/ru');
    await expect(page.getByTestId('landing-pricing-cta')).toHaveAttribute('href', '/app/billing');
    await expect(page.getByTestId('landing-cta')).toHaveAttribute('href', '/login');

    await footer(page).getByRole('link', { name: 'Установка', exact: true }).click();
    await expect(page).toHaveURL(/\/ru\/install$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test('English pages keep unprefixed links', async ({ page }) => {
    await page.goto('/terms');
    const hrefs = await footer(page)
      .getByRole('navigation')
      .getByRole('link')
      .evaluateAll((all) => all.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/#pricing', '/install', '/login', '/privacy', '/terms', '/refund']);
  });
});

test.describe('SEO', () => {
  test('both versions carry canonical, hreflang and the OpenGraph locale', async ({
    page,
    baseURL,
  }) => {
    const cases = [
      { path: '/install', og: 'en_US' },
      { path: '/ru/install', og: 'ru_RU' },
    ];
    for (const { path, og } of cases) {
      await page.goto(path);
      const head = page.locator('head');
      await expect(head.locator('link[rel="canonical"]'), path).toHaveAttribute(
        'href',
        `${baseURL}${path}`,
      );
      for (const [lang, href] of [
        ['en', '/install'],
        ['ru', '/ru/install'],
        ['x-default', '/install'],
      ]) {
        await expect(
          head.locator(`link[rel="alternate"][hreflang="${lang}"]`),
          `${path} ${lang}`,
        ).toHaveAttribute('href', `${baseURL}${href}`);
      }
      await expect(head.locator('meta[property="og:locale"]'), path).toHaveAttribute('content', og);
      await expect(head.locator('meta[property="og:url"]'), path).toHaveAttribute(
        'content',
        `${baseURL}${path}`,
      );
      // The page-level OpenGraph keeps the site's share image (and the large Twitter card).
      await expect(head.locator('meta[property="og:image"]'), path).toHaveAttribute(
        'content',
        /\/opengraph-image/,
      );
      await expect(head.locator('meta[name="twitter:card"]'), path).toHaveAttribute(
        'content',
        'summary_large_image',
      );
    }

    await page.goto('/ru');
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${baseURL}/ru`,
    );
    await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      new RegExp(`^${baseURL}/?$`),
    );
  });

  test('the middleware sends no hreflang Link header (metadata is the single source)', async ({
    request,
  }) => {
    const response = await request.get('/ru/install', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['link'] ?? '').not.toContain('hreflang');
  });

  test('the sitemap lists both versions of every public page', async ({ request, baseURL }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    for (const path of [
      '/ru',
      '/install',
      '/ru/install',
      '/ru/privacy',
      '/ru/terms',
      '/ru/refund',
    ]) {
      expect(xml, path).toContain(`<loc>${baseURL}${path}</loc>`);
    }
    expect(xml).toContain(`hreflang="ru" href="${baseURL}/ru/install"`);
    expect(xml).toContain(`hreflang="x-default" href="${baseURL}/install"`);
    expect(xml.match(/<loc>[^<]*\/login<\/loc>/g)).toHaveLength(1);
  });
});

test.describe('demo language', () => {
  const EN_BROWSER = { 'accept-language': 'en-US,en;q=0.9' };

  test('the demo pages render in a valid ?lang and ignore an unknown one', async ({ request }) => {
    for (const path of ['/demo/shop', '/demo/dashboard']) {
      const ru = await request.get(`${path}?lang=ru`, { headers: EN_BROWSER, timeout: 60_000 });
      expect(await ru.text(), path).toContain('<html lang="ru"');
      const unknown = await request.get(`${path}?lang=de`, { headers: EN_BROWSER });
      expect(await unknown.text(), path).toContain('<html lang="en"');
    }
    const shop = await request.get('/demo/shop?lang=ru', { headers: EN_BROWSER });
    expect(await shop.text()).toContain('Оплатить');
  });

  test('a client-sent next-intl locale header is ignored outside the public pages', async ({
    request,
  }) => {
    const response = await request.get('/login', {
      headers: { ...EN_BROWSER, 'x-next-intl-locale': 'ru' },
    });
    expect(await response.text()).toContain('<html lang="en"');
  });

  test('the /ru landing demo reaches the dashboard scene in Russian', async ({ page }) => {
    test.setTimeout(90_000);
    // The first dev compile of the demo routes can take a while; do it outside the clock.
    for (const path of ['/demo/shop?lang=ru', '/demo/dashboard?lang=ru']) {
      expect((await page.request.get(path, { timeout: 60_000 })).ok()).toBe(true);
    }
    await page.goto('/ru');
    await page.getByTestId('landing-demo').scrollIntoViewIfNeeded();
    const shop = page.locator('iframe[title="Nova Shop"]');
    await expect(shop).toHaveAttribute('src', '/demo/shop?lang=ru', { timeout: 30_000 });
    await expect(shop.contentFrame().locator('html')).toHaveAttribute('lang', 'ru');

    await expect(page.locator('[data-testid="demo-scene"][data-scene="dashboard"]')).toBeVisible({
      timeout: 45_000,
    });
    const dashboard = page.locator('iframe[title="Bugping"]');
    await expect(dashboard).toHaveAttribute('src', /^\/demo\/dashboard\?r=[\w-]+&lang=ru$/);
    const frame = dashboard.contentFrame();
    await expect(frame.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(frame.getByText('Отзывы').first()).toBeAttached();
  });
});
