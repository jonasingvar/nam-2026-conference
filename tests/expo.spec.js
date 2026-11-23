import { test, expect } from '@playwright/test';
import { API, visit, failOnPageErrors, shotForPR } from './helpers.js';

const TIERS = ['diamond', 'platinum', 'gold', 'silver', 'bronze'];

test('expo search narrows sponsors by name, keeps the text in the URL and clears', async ({ page, request }) => {
  const errors = failOnPageErrors(page);
  const sponsors = await (await request.get(`${API}/sponsors`)).json();
  const target = sponsors[0];
  const frag = target.name.slice(1, 5);
  const expected = sponsors.filter((s) => s.name.toLowerCase().includes(frag.toLowerCase()));
  const expectedTiers = new Set(expected.map((s) => s.tier.toLowerCase()));
  const cards = page.locator('[data-testid^="tier-"] h3');

  await visit(page, '/expo');
  const box = page.getByTestId('expo-search');
  await expect(box).toBeVisible();
  await expect(cards).toHaveCount(sponsors.length);

  await box.fill(frag.toUpperCase());
  await expect(cards).toHaveCount(expected.length);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(frag.toUpperCase())}`));
  for (const t of TIERS) {
    await expect(page.getByTestId(`tier-${t}`)).toHaveCount(expectedTiers.has(t) ? 1 : 0);
  }
  await expect(page.getByRole('heading', { name: target.name, level: 3 })).toBeVisible();
  await shotForPR(page, 'Expo narrowed to sponsors matching the search');

  // reload restores it
  await page.reload();
  await expect(box).toHaveValue(frag.toUpperCase());
  await expect(cards).toHaveCount(expected.length);

  // nothing matches
  await box.fill('zzzz');
  await expect(page.getByText('No sponsors match “zzzz”')).toBeVisible();
  await expect(cards).toHaveCount(0);

  // clearing shows everything
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(box).toHaveValue('');
  await expect(cards).toHaveCount(sponsors.length);
  for (const t of TIERS) await expect(page.getByTestId(`tier-${t}`)).toHaveCount(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors.filter((e) => !e.includes('ERR_NAME_NOT_RESOLVED'))).toEqual([]);
});

test('expo opens already filtered from a shared link', async ({ page }) => {
  await visit(page, '/expo?q=zzzz');
  await expect(page.getByTestId('expo-search')).toHaveValue('zzzz');
  await expect(page.getByText('No sponsors match “zzzz”')).toBeVisible();
});
