import { expect, test } from '@playwright/test';

for (const doc of ['privacy', 'terms', 'refund'] as const) {
  test(`${doc} page names the operator and is not a draft`, async ({ page }) => {
    await page.goto(`/${doc}`);
    const operator = page.getByTestId('legal-operator');
    await expect(operator).toContainText('Dymko Artem Ruslanovych');
    await expect(operator.getByRole('link', { name: 'dymyk2007@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:dymyk2007@gmail.com',
    );
    await expect(page.getByTestId(`legal-${doc}`)).not.toContainText(/draft/i);
    expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThan(3);
  });
}

test('the Russian terms keep the operator name and the Paddle reseller clause', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'locale', value: 'ru', url: baseURL! }]);
  await page.goto('/terms');
  await expect(page.getByTestId('legal-operator')).toContainText('Димко Артем Русланович');
  await expect(page.getByTestId('legal-terms')).toContainText('Paddle.com является продавцом');
});
