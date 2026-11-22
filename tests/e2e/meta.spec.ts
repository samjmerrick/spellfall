import { expect, test, type Page } from '@playwright/test';

import { loadProfile, newProfile, openMenu, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

async function noOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** A mid-game profile: one Ascension won, some results to show. */
function veteran() {
  const p = newProfile();
  p.ascension = { best: 2, unlocked: 3 };
  p.stats.runs = { 'hero-pyra': { played: 4, won: 2 }, 'hero-aldric': { played: 1, won: 0 } };
  p.stats.quickPlay = { ember: { played: 6, won: 4 }, d1: { played: 2, won: 0 } };
  return p;
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const shot = (page: Page, name: string) =>
      page.screenshot({ path: `test-results/screens/${name}-${vp.width}x${vp.height}.png` });

    test('a new profile has an empty stats screen', async ({ page }) => {
      const errors = watchErrors(page);
      await openMenu(page, '?seed=7');
      await expect(page.getByText(/XP|Level \d/)).toHaveCount(0);
      await noOverflow(page);
      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await expect(page.getByRole('main', { name: 'Stats' })).toBeVisible();
      await expect(page.getByText(/Nothing recorded yet/)).toBeVisible();
      await expect(page.getByText('No Quick Play matches yet.')).toBeVisible();
      expect(
        await page.getByRole('list', { name: 'Runs by hero' }).getByRole('listitem').count(),
      ).toBeGreaterThanOrEqual(10);
      await expect(page.getByText('Locked')).toHaveCount(0);
      await noOverflow(page);
      await shot(page, 'stats-empty');
      expect(errors).toEqual([]);
    });

    test('run start: every hero is playable on a new profile', async ({ page }) => {
      await openMenu(page, '?seed=7');
      await page.getByRole('button', { name: 'New run' }).click();
      const heroes = page.getByRole('radiogroup', { name: 'Hero' }).getByRole('radio');
      expect(await heroes.count()).toBeGreaterThanOrEqual(10);
      await expect(heroes.and(page.locator(':disabled'))).toHaveCount(0);
      await expect(page.getByText(/^Unlocks at level/)).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Ascension' })).toBeHidden();
      await noOverflow(page);
      await shot(page, 'run-start-new');
    });

    test('Ascension picker, stats and menu for a veteran profile', async ({ page }) => {
      const errors = watchErrors(page);
      await loadProfile(page, veteran());
      await noOverflow(page);

      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await expect(page.getByText('Best Ascension won')).toBeVisible();
      await expect(page.getByRole('list', { name: 'Quick Play by deck' })).toContainText('4/6 · 67%');
      await noOverflow(page);
      await shot(page, 'stats');
      await page.getByRole('button', { name: 'Back', exact: true }).click();

      await page.getByRole('button', { name: 'New run' }).click();
      const picker = page.getByRole('region', { name: 'Ascension' });
      await expect(picker).toBeVisible();
      await expect(picker.getByText('Best: Ascension 2')).toBeVisible();
      await expect(picker.getByRole('button', { name: 'Lower Ascension' })).toBeDisabled();
      const rules = page.getByRole('list', { name: 'Active Ascension rules' });
      await picker.getByRole('button', { name: 'Raise Ascension' }).click();
      await picker.getByRole('button', { name: 'Raise Ascension' }).click();
      await picker.getByRole('button', { name: 'Raise Ascension' }).click();
      await expect(picker.getByRole('button', { name: 'Raise Ascension' })).toBeDisabled();
      await expect(picker.getByText('Ascension 3', { exact: true })).toBeVisible();
      await expect(rules.getByRole('listitem')).toHaveCount(3);
      await expect(page.getByRole('button', { name: 'Begin run · Ascension 3' })).toBeVisible();
      await noOverflow(page);
      await shot(page, 'run-start-ascension');

      await page.getByRole('button', { name: 'Begin run · Ascension 3' }).click();
      await expect(page.getByRole('main', { name: 'Run' })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the collection has no locked cards', async ({ page }) => {
      await openMenu(page, '?seed=7');
      await page.getByRole('button', { name: 'Collection', exact: true }).click();
      await expect(page.locator('.grid-card').first()).toBeVisible();
      await expect(page.locator('.grid-card__lock')).toHaveCount(0);
      await expect(page.locator('.grid-card--locked')).toHaveCount(0);
    });
  });
}
