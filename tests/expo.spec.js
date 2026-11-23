import { test, expect } from '@playwright/test';
import { API, visit, shotForPR } from './helpers.js';

test.describe('Expo search', () => {
  test('narrows sponsors by name, keeps the text in the URL, and clears', async ({ page, request }) => {
    const sponsors = await (await request.get(`${API}/sponsors`)).json();
    const target = sponsors[0];
    const fragment = target.name.slice(0, 3).toUpperCase();
    const expected = sponsors.filter((s) => s.name.toLowerCase().includes(fragment.toLowerCase()));
    const tiers = new Set(expected.map((s) => s.tier.toLowerCase()));

    await visit(page, '/expo');
    const search = page.getByTestId('expo-search');
    await expect(search).toBeVisible();
    const box = await search.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);

    await search.fill(fragment);
    await expect(page).toHaveURL(new RegExp(`q=${fragment}`));
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(expected.length);
    await expect(page.getByRole('heading', { level: 3, name: target.name })).toBeVisible();
    for (const t of ['diamond', 'platinum', 'gold', 'silver', 'bronze']) {
      await expect(page.getByTestId(`tier-${t}`)).toHaveCount(tiers.has(t) ? 1 : 0);
    }
    await shotForPR(page, 'Expo filtered by a sponsor name');

    // reload restores it
    await visit(page, `/expo?q=${fragment}`);
    await expect(search).toHaveValue(fragment);
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(expected.length);

    await search.fill('zzqx');
    await expect(page.getByRole('heading', { name: 'No sponsors match “zzqx”' })).toBeVisible();

    await search.fill('');
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(sponsors.length);
    for (const t of new Set(sponsors.map((s) => s.tier.toLowerCase()))) {
      await expect(page.getByTestId(`tier-${t}`)).toHaveCount(1);
    }
    await expect(page).not.toHaveURL(/q=/);
  });
});
