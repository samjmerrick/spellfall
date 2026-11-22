import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../../src/save';

// XP curve from src/run/meta.ts (not imported: that module needs a bundler for its JSON).
const xpThreshold = (level: number) => (level - 1) * (100 + 25 * level);

function withXp(profile: Profile, xp: number) {
  let level = 1;
  while (xp >= xpThreshold(level + 1)) level++;
  return { ...profile, xp, level };
}
import { playDuel } from './duel';
import { keepHand, loadProfile, newProfile, openMenu, watchErrors } from './helpers';
import { VIEWPORTS } from './viewports';

async function noOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** A mid-game profile: level 8, one Ascension won, some results to show. */
function veteran() {
  const p = withXp(newProfile(), xpThreshold(8) + 120);
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

    test('a new profile starts at level 1 with an empty stats screen', async ({ page }) => {
      const errors = watchErrors(page);
      await openMenu(page, '?seed=7');
      await expect(page.getByText(/^Level 1 · 0\/150 XP$/)).toBeVisible();
      await noOverflow(page);
      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await expect(page.getByRole('main', { name: 'Stats' })).toBeVisible();
      await expect(page.getByText(/Nothing recorded yet/)).toBeVisible();
      await expect(page.getByText('No Quick Play matches yet.')).toBeVisible();
      await expect(page.getByRole('list', { name: 'Runs by hero' }).getByRole('listitem')).toHaveCount(10);
      await expect(page.locator('.stats__row--locked')).toHaveCount(7);
      await noOverflow(page);
      await shot(page, 'stats-empty');
      expect(errors).toEqual([]);
    });

    test('run start: 3 heroes playable and 7 locked on a new profile', async ({ page }) => {
      await openMenu(page, '?seed=7');
      await page.getByRole('button', { name: 'New run' }).click();
      const heroes = page.getByRole('radiogroup', { name: 'Hero' }).getByRole('radio');
      await expect(heroes).toHaveCount(10);
      await expect(heroes.and(page.locator(':enabled'))).toHaveCount(3);
      await expect(heroes.and(page.locator(':disabled'))).toHaveCount(7);
      await expect(page.getByText(/^Unlocks at level \d+$/)).toHaveCount(7);
      await expect(page.getByRole('region', { name: 'Ascension' })).toBeHidden();
      await noOverflow(page);
      await shot(page, 'run-start-new');
    });

    test('Ascension picker, stats and menu for a veteran profile', async ({ page }) => {
      const errors = watchErrors(page);
      await loadProfile(page, veteran());
      await expect(page.getByText(/^Level 8 · 120\/\d+ XP$/)).toBeVisible();
      await noOverflow(page);
      await shot(page, 'menu-level');

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

    test('the collection says which level unlocks a locked card', async ({ page }) => {
      await openMenu(page, '?seed=7');
      await page.getByRole('button', { name: 'Collection', exact: true }).click();
      await expect(page.locator('.grid-card__lock').first()).toHaveText(/^Unlocks at level \d+$/);
    });

    test('finishing a match that levels up shows what was unlocked', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      // One level short of 3 (a hero bundle), so any result crosses it.
      await loadProfile(page, withXp(newProfile(), xpThreshold(3) - 10));
      await page.getByRole('button', { name: 'Quick Play' }).click();
      await page.getByRole('button', { name: 'Start match' }).click();
      await expect(page.getByRole('main', { name: 'Match' })).toBeVisible();
      await keepHand(page);
      const result = page.getByRole('dialog', { name: 'Match result' });
      await playDuel(page);
      const levelUp = page.getByRole('dialog', { name: 'Level up' });
      await expect(levelUp).toBeVisible();
      await expect(levelUp.getByRole('heading', { name: 'Level 3!' })).toBeVisible();
      await expect(levelUp.getByText('New hero')).toBeVisible();
      await expect(levelUp.locator('.card')).toHaveCount(3);
      await page.waitForTimeout(600);
      await noOverflow(page);
      await shot(page, 'levelup');
      await levelUp.getByRole('button', { name: 'Continue' }).click();
      await expect(levelUp).toBeHidden();
      await expect(result).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
